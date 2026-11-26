use crate::PummelRootView;
use gpui::{AnyElement, Context, IntoElement, ParentElement, SharedString, Styled, div, rgb};

pub fn render_telemetry_view(
    view: &PummelRootView,
    _cx: &mut Context<PummelRootView>,
) -> AnyElement {
    let analysis = view.state.post_run_analysis();
    let anomalies = view.state.anomalies();

    let mut rec_list = div().flex().flex_col().gap_1();
    for rec in &analysis.recommendations {
        rec_list = rec_list.child(SharedString::from(format!("• {rec}")));
    }

    let mut log_list = div().flex().flex_col().gap_1();
    for entry in view.state.logs.iter().take(12) {
        log_list = log_list.child(SharedString::from(format!(
            "[{}] [{}] ({}) {}",
            entry.timestamp, entry.level, entry.source, entry.message
        )));
    }

    div()
        .flex()
        .flex_col()
        .gap_4()
        .child(
            div()
                .p_3()
                .rounded_md()
                .bg(rgb(0x1e293b))
                .child(SharedString::from(format!(
                    "Post-Run Analysis — Grade: {} | Requests: {} | Failures: {} ({:.2}%) | Avg: {:.1}ms | p95: {:.1}ms | p99: {:.1}ms | Peak RPS: {:.1} | Anomalies: {}",
                    analysis.grade,
                    analysis.total_requests,
                    analysis.total_failures,
                    analysis.fail_rate_pct,
                    analysis.avg_ms,
                    analysis.p95_ms,
                    analysis.p99_ms,
                    analysis.peak_rps,
                    anomalies.len()
                ))),
        )
        .child(
            div()
                .p_3()
                .rounded_md()
                .bg(rgb(0x1e293b))
                .child(SharedString::from("Recommendations"))
                .child(rec_list),
        )
        .child(
            div()
                .p_3()
                .rounded_md()
                .bg(rgb(0x1e293b))
                .child(SharedString::from(format!(
                    "Recorded Replay Sessions: {}",
                    view.state.sessions.len()
                ))),
        )
        .child(
            div()
                .p_3()
                .rounded_md()
                .bg(rgb(0x1e293b))
                .child(SharedString::from("Execution Logs & Event Timeline"))
                .child(log_list),
        )
        .into_any_element()
}
