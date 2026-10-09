//! Keeps the OS from sleeping (or locking the screen) ONLY while a quiz is in
//! progress. Created once in `lib.rs`'s `setup()` and stored in Tauri's
//! managed state. It starts out idle (the PC may sleep normally); the
//! frontend calls the `set_sleep_inhibit` command, which calls `engage()`
//! when a quiz starts and `release()` when it ends. A paused quiz still counts
//! as in progress, so the frontend leaves the guard engaged while paused.
//!
//! IMPORTANT: a held inhibitor is *not* released automatically just because
//! the app "exits". `std::process::exit()` (which is what
//! `@tauri-apps/plugin-process`'s `exit()` calls, and what Tauri's own event
//! loop teardown uses on some platforms) terminates the process immediately
//! and does NOT run Rust `Drop` impls. So relying on Drop alone could leave
//! the child inhibitor process (systemd-inhibit on Linux, caffeinate on macOS)
//! orphaned and running forever, still holding the sleep lock.
//!
//! To avoid that, `stop()` must be called *explicitly* before exiting — see
//! `commands::app::quit` and the `on_window_event` handler in `lib.rs`, both
//! of which call it before ever calling `std::process::exit`. `stop()`
//! releases the guard AND permanently disables it, so a late `engage()` can
//! not re-acquire the lock while the app is shutting down. Drop calls
//! `stop()` too (idempotent) as defense-in-depth.
//!
//! Platform-specific:
//! - Windows: `SetThreadExecutionState` only holds until the next call (or
//!   until the calling thread exits), so while engaged a background thread
//!   re-asserts it every 30s. `release()` wakes that thread immediately so it
//!   hands execution-state control back to the system.
//! - macOS: spawns `caffeinate -dis` and keeps the child process running;
//!   killing it releases the sleep assertion.
//! - Linux: spawns `systemd-inhibit ... sleep infinity`, which holds a
//!   logind inhibitor lock for as long as that child process runs; killing
//!   it releases the lock. If `systemd-inhibit` isn't available
//!   (non-systemd distros), this logs a warning and the app simply runs
//!   without sleep prevention rather than failing.

#[cfg(target_os = "windows")]
mod imp {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc::{self, RecvTimeoutError, Sender};
    use std::sync::Mutex;
    use std::thread;
    use std::time::Duration;

    #[link(name = "kernel32")]
    extern "system" {
        fn SetThreadExecutionState(esFlags: u32) -> u32;
    }

    const ES_CONTINUOUS: u32 = 0x8000_0000;
    const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;
    const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;

    pub struct SleepGuard {
        /// Present while engaged. Dropping the sender wakes the background
        /// thread, which then releases the execution state and exits.
        release_tx: Mutex<Option<Sender<()>>>,
        stopped: AtomicBool,
    }

    impl SleepGuard {
        /// Creates an idle guard — the PC is allowed to sleep until `engage()`.
        pub fn new() -> Self {
            SleepGuard { release_tx: Mutex::new(None), stopped: AtomicBool::new(false) }
        }

        /// Start preventing sleep. Does nothing if already engaged or stopped.
        pub fn engage(&self) {
            if self.stopped.load(Ordering::SeqCst) {
                return;
            }
            let Ok(mut guard) = self.release_tx.lock() else { return };
            if guard.is_some() {
                return;
            }
            let (tx, rx) = mpsc::channel::<()>();
            thread::spawn(move || {
                loop {
                    unsafe {
                        SetThreadExecutionState(
                            ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED,
                        );
                    }
                    match rx.recv_timeout(Duration::from_secs(30)) {
                        Err(RecvTimeoutError::Timeout) => continue,
                        _ => break, // sender dropped (released) or message received
                    }
                }
                // Hand execution-state control back to the system default.
                unsafe {
                    SetThreadExecutionState(ES_CONTINUOUS);
                }
            });
            *guard = Some(tx);
        }

        /// Stop preventing sleep. Safe to call when not engaged.
        pub fn release(&self) {
            if let Ok(mut guard) = self.release_tx.lock() {
                guard.take(); // dropping the sender wakes and ends the thread
            }
        }

        /// Release and permanently disable the guard. Must be called before
        /// `std::process::exit`, which would otherwise skip `Drop`.
        pub fn stop(&self) {
            self.stopped.store(true, Ordering::SeqCst);
            self.release();
        }
    }

    impl Drop for SleepGuard {
        fn drop(&mut self) {
            self.stop();
        }
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod imp {
    use std::process::{Child, Command};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;

    /// macOS: -d prevents display sleep, -i idle sleep, -s system sleep (on
    /// AC power). Held for as long as the child process runs.
    #[cfg(target_os = "macos")]
    fn spawn_inhibitor() -> Option<Child> {
        let child = Command::new("caffeinate").arg("-dis").spawn().ok();
        if child.is_none() {
            log::warn!("caffeinate unavailable, sleep prevention disabled");
        }
        child
    }

    /// Linux: systemd-inhibit holds a logind inhibitor lock for as long as the
    /// command it wraps keeps running — `sleep infinity` just keeps that lock
    /// open until we kill it.
    #[cfg(target_os = "linux")]
    fn spawn_inhibitor() -> Option<Child> {
        let child = Command::new("systemd-inhibit")
            .args([
                "--what=idle:sleep:handle-lid-switch",
                "--who=LAMBDAn",
                "--why=Quiz in progress",
                "sleep",
                "infinity",
            ])
            .spawn()
            .ok();
        if child.is_none() {
            log::warn!("systemd-inhibit unavailable, sleep prevention disabled");
        }
        child
    }

    pub struct SleepGuard {
        child: Mutex<Option<Child>>,
        stopped: AtomicBool,
    }

    impl SleepGuard {
        /// Creates an idle guard — the PC is allowed to sleep until `engage()`.
        pub fn new() -> Self {
            SleepGuard { child: Mutex::new(None), stopped: AtomicBool::new(false) }
        }

        /// Start preventing sleep. Does nothing if already engaged or stopped.
        pub fn engage(&self) {
            if self.stopped.load(Ordering::SeqCst) {
                return;
            }
            let Ok(mut guard) = self.child.lock() else { return };
            if let Some(c) = guard.as_mut() {
                // Still running? Then we're already holding the lock.
                if matches!(c.try_wait(), Ok(None)) {
                    return;
                }
            }
            *guard = spawn_inhibitor();
        }

        /// Stop preventing sleep: kill the inhibitor child and reap it so it
        /// doesn't linger as a zombie. Safe to call when not engaged.
        pub fn release(&self) {
            if let Ok(mut guard) = self.child.lock() {
                if let Some(mut c) = guard.take() {
                    let _ = c.kill();
                    let _ = c.wait();
                }
            }
        }

        /// Release and permanently disable the guard. Must be called before
        /// `std::process::exit`, which would otherwise skip `Drop` and leave
        /// the inhibitor running as an orphan, holding the lock after
        /// LAMBDAn has closed.
        pub fn stop(&self) {
            self.stopped.store(true, Ordering::SeqCst);
            self.release();
        }
    }

    impl Drop for SleepGuard {
        fn drop(&mut self) {
            self.stop();
        }
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
mod imp {
    pub struct SleepGuard;

    impl SleepGuard {
        pub fn new() -> Self {
            log::warn!("sleep prevention not implemented for this platform");
            SleepGuard
        }

        pub fn engage(&self) {}
        pub fn release(&self) {}
        pub fn stop(&self) {}
    }
}

pub use imp::SleepGuard;
