use crate::PummelRootView;
use gpui::{
    AnyElement, Context, InteractiveElement, IntoElement, ParentElement, SharedString,
    StatefulInteractiveElement, Styled, div, rgb,
};

pub fn render_compliance_view(
    view: &PummelRootView,
    cx: &mut Context<PummelRootView>,
) -> AnyElement {
    let mut rows = div().flex().flex_col().gap_2();
    for item in &view.state.compliance_items {
        if view.state.compliance_filter != "All" && item.group != view.state.compliance_filter {
            continue;
        }
        let badge_bg = match item.status.as_str() {
            "pass" => rgb(0x16a34a),
            "warning" => rgb(0xd97706),
            _ => rgb(0xdc2626),
        };
        rows = rows.child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .p_2()
                .rounded_md()
                .bg(rgb(0x1e293b))
                .child(SharedString::from(format!(
                    "[{}] {} ({}) — {}",
                    item.id, item.title, item.category, item.evidence
                )))
                .child(
                    div()
                        .px_2()
                        .py_1()
                        .rounded_md()
                        .bg(badge_bg)
                        .text_color(rgb(0xf8fafc))
                        .child(SharedString::from(item.status.to_uppercase())),
                ),
        );
    }

    div()
        .flex()
        .flex_col()
        .gap_4()
        .child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(SharedString::from("Live FR / NFR Compliance Matrix"))
                .child(
                    div()
                        .id("btn-reaudit")
                        .px_3()
                        .py_1()
                        .rounded_md()
                        .bg(rgb(0x2563eb))
                        .text_color(rgb(0xf8fafc))
                        .cursor_pointer()
                        .child(SharedString::from("Re-run Audit"))
                        .on_click(cx.listener(|this, _ev, _win, cx| {
                            this.state.refresh_compliance();
                            cx.notify();
                        })),
                ),
        )
        .child(rows)
        .into_any_element()
}
