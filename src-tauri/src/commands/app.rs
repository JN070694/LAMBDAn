use crate::sleep_guard::SleepGuard;
use tauri::State;

/// Releases the sleep-prevention lock and *then* exits. This must be used
/// instead of `@tauri-apps/plugin-process`'s `exit()` everywhere in the
/// frontend — that call maps to `std::process::exit()`, which terminates
/// the process immediately without running `Drop`, leaving the sleep
/// guard's child process (systemd-inhibit on Linux, caffeinate on macOS)
/// orphaned and still holding the OS sleep lock indefinitely.
#[tauri::command]
pub fn quit(sleep_guard: State<SleepGuard>) {
    sleep_guard.stop();
    std::process::exit(0);
}

/// Called by the frontend whenever a quiz starts or ends. While `active` is
/// true the OS is kept from sleeping; when false the PC may sleep normally.
/// A paused quiz still counts as active, so the frontend keeps this true
/// while paused.
#[tauri::command]
pub fn set_sleep_inhibit(active: bool, sleep_guard: State<SleepGuard>) {
    if active {
        sleep_guard.engage();
    } else {
        sleep_guard.release();
    }
}
