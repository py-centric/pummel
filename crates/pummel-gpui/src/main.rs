use std::path::PathBuf;

fn main() {
    let mut port = std::env::var("PUMMEL_CONTROL_PORT")
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(8000);
    let mut initial_projects: Vec<PathBuf> = Vec::new();

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--project" | "-P" => {
                if let Some(dir) = args.next() {
                    initial_projects.push(PathBuf::from(dir));
                }
            }
            "--port" | "-p" => {
                if let Some(p) = args.next().and_then(|v| v.parse::<u16>().ok()) {
                    port = p;
                }
            }
            other if !other.starts_with('-') => {
                initial_projects.push(PathBuf::from(other));
            }
            _ => {}
        }
    }

    pummel_gpui::run_gpui_app(port, initial_projects);
}
