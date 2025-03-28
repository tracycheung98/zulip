import $ from "jquery";

import render_mark_as_read_disabled_banner from "../templates/unread_banner/mark_as_read_disabled_banner.hbs";
import render_mark_as_read_only_in_conversation_view from "../templates/unread_banner/mark_as_read_only_in_conversation_view.hbs";
import render_mark_as_read_turned_off_banner from "../templates/unread_banner/mark_as_read_turned_off_banner.hbs";

import * as activity from "./activity";
import * as message_lists from "./message_lists";
import * as narrow_state from "./narrow_state";
import * as notifications from "./notifications";
import {page_params} from "./page_params";
import * as pm_list from "./pm_list";
import {web_mark_read_on_scroll_policy_values} from "./settings_config";
import * as stream_list from "./stream_list";
import * as top_left_corner from "./top_left_corner";
import * as topic_list from "./topic_list";
import * as unread from "./unread";
import {notify_server_messages_read} from "./unread_ops";
import {user_settings} from "./user_settings";

let user_closed_unread_banner = false;

export function update_unread_banner() {
    const filter = narrow_state.filter();
    const is_conversation_view = filter === undefined ? false : filter.is_conversation_view();
    if (
        user_settings.web_mark_read_on_scroll_policy ===
        web_mark_read_on_scroll_policy_values.never.code
    ) {
        $("#mark_as_read_turned_off_banner").html(render_mark_as_read_disabled_banner());
    } else if (
        user_settings.web_mark_read_on_scroll_policy ===
            web_mark_read_on_scroll_policy_values.conversation_only.code &&
        !is_conversation_view
    ) {
        $("#mark_as_read_turned_off_banner").html(render_mark_as_read_only_in_conversation_view());
    } else {
        $("#mark_as_read_turned_off_banner").html(render_mark_as_read_turned_off_banner());

        if (message_lists.current.can_mark_messages_read_without_setting()) {
            hide_unread_banner();
        }
    }
}

export function hide_unread_banner() {
    // Use visibility instead of hide() to prevent messages on the screen from
    // shifting vertically.
    $("#mark_as_read_turned_off_banner").toggleClass("invisible", true);
}

export function reset_unread_banner() {
    hide_unread_banner();
    user_closed_unread_banner = false;
}

export function notify_messages_remain_unread() {
    if (!user_closed_unread_banner) {
        $("#mark_as_read_turned_off_banner").toggleClass("invisible", false);
    }
}

export function set_count_toggle_button($elem, count) {
    if (count === 0) {
        if ($elem.is(":animated")) {
            return $elem.stop(true, true).hide();
        }
        return $elem.hide(500);
    } else if (count > 0 && count < 1000) {
        $elem.show(500);
        return $elem.text(count);
    }
    $elem.show(500);
    return $elem.text("1k+");
}

export function update_unread_counts() {
    // Pure computation:
    const res = unread.get_counts();

    // Side effects from here down:
    // This updates some DOM elements directly, so try to
    // avoid excessive calls to this.
    activity.update_dom_with_unread_counts(res);
    top_left_corner.update_dom_with_unread_counts(res);
    stream_list.update_dom_with_unread_counts(res);
    pm_list.update_dom_with_unread_counts(res);
    topic_list.update();
    const notifiable_unread_count = unread.calculate_notifiable_count(res);
    notifications.update_unread_counts(notifiable_unread_count, res.private_message_count);

    // Set the unread counts that we show in the buttons that
    // toggle open the sidebar menus when we have a thin window.
    set_count_toggle_button($("#streamlist-toggle-unreadcount"), res.home_unread_messages);
    // Bots and group PMs do not appear in the right sidebar user list, so
    // we show unread count for only non bot 1:1 private messages there.
    set_count_toggle_button(
        $("#userlist-toggle-unreadcount"),
        res.right_sidebar_private_message_count,
    );
}

export function should_display_bankruptcy_banner() {
    // Until we've handled possibly declaring bankruptcy, don't show
    // unread counts since they only consider messages that are loaded
    // client side and may be different from the numbers reported by
    // the server.

    if (!page_params.furthest_read_time) {
        // We've never read a message.
        return false;
    }

    const now = Date.now() / 1000;
    if (
        unread.get_unread_message_count() > 500 &&
        now - page_params.furthest_read_time > 60 * 60 * 24 * 2
    ) {
        // 2 days.
        return true;
    }

    return false;
}

export function initialize() {
    update_unread_counts();
    $("body").on("click", "#mark_view_read", () => {
        // Mark all messages in the current view as read.
        //
        // BUG: This logic only supports marking messages visible in
        // the present view as read; we need a server API to mark
        // every message matching the current search as read.
        const unread_messages = message_lists.current.data
            .all_messages()
            .filter((message) => unread.message_unread(message));
        notify_server_messages_read(unread_messages);
        // New messages received may be marked as read based on narrow type.
        message_lists.current.resume_reading();

        hide_unread_banner();
    });
    $("body").on("click", "#mark_as_read_close", () => {
        hide_unread_banner();
        user_closed_unread_banner = true;
    });

    // The combination of these functions in sequence ensures we have
    // at least one copy of the unread banner in the DOM, invisible;
    // this somewhat strange pattern allows our CSS to reserve space for
    // the banner, to avoid scroll position jumps when it is shown/hidden.
    update_unread_banner();
    hide_unread_banner();
}
