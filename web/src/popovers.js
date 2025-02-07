import $ from "jquery";
import {hideAll} from "tippy.js";

import * as blueslip from "./blueslip";
import * as emoji_picker from "./emoji_picker";
import * as overlays from "./overlays";
import * as playground_links_popover from "./playground_links_popover";
import * as popover_menus from "./popover_menus";
import * as resize from "./resize";
import * as stream_popover from "./stream_popover";
import * as user_card_popover from "./user_card_popover";
import * as user_group_popover from "./user_group_popover";

let list_of_popovers = [];

// this utilizes the proxy pattern to intercept all calls to $.fn.popover
// and push the $.fn.data($o, "popover") results to an array.
// this is needed so that when we try to unload popovers, we can kill all dead
// ones that no longer have valid parents in the DOM.
const old_popover = $.fn.popover;
$.fn.popover = Object.assign(function (...args) {
    // apply the jQuery object as `this`, and popover function arguments.
    old_popover.apply(this, args);

    // if there is a valid "popover" key in the jQuery data object then
    // push it to the array.
    if (this.data("popover")) {
        list_of_popovers.push(this.data("popover"));
    }
}, old_popover);

function get_action_menu_menu_items() {
    const $current_actions_popover_elem = $("[data-tippy-root] .actions_popover");
    if (!$current_actions_popover_elem) {
        blueslip.error("Trying to get menu items when action popover is closed.");
        return undefined;
    }

    return $current_actions_popover_elem.find("li:not(.divider):visible a");
}

export function focus_first_popover_item($items, index = 0) {
    if (!$items) {
        return;
    }

    $items.eq(index).expectOne().trigger("focus");
}

export function popover_items_handle_keyboard(key, $items) {
    if (!$items) {
        return;
    }

    let index = $items.index($items.filter(":focus"));

    if (key === "enter" && index >= 0 && index < $items.length) {
        $items[index].click();
        if (user_card_popover.manage_menu.is_open()) {
            // If we just opened the little manage menu via the
            // keyboard, we need to focus the first item for a
            // continuation of the keyboard experience.

            // TODO: This might be cleaner to just call
            // toggle_user_card_popover_manage_menu rather than
            // triggering a click.

            const previously_defined_on_mount =
                user_card_popover.manage_menu.instance.props.onMount;
            user_card_popover.manage_menu.instance.setProps({
                onMount() {
                    // We're monkey patching the onMount method here to ensure we start
                    // focusing on the item after the popover is mounted to the DOM;
                    // otherwise, it won't work correctly.
                    if (previously_defined_on_mount) {
                        previously_defined_on_mount();
                    }
                    const $items = user_card_popover.get_user_card_popover_manage_menu_items();
                    focus_first_popover_item($items);
                },
            });
        }
        return;
    }
    if (index === -1) {
        if (
            $(".user-card-popover-manage-menu-btn").is(":visible") &&
            !user_card_popover.manage_menu.is_open()
        ) {
            // If we have a "Manage Menu" button in the user card popover,
            // the first item to receive focus shouldn't be that button.
            // However, if the Manage Menu is open, focus should shift to
            // the first item in that popover.
            index = 1;
        } else {
            index = 0;
        }
    } else if ((key === "down_arrow" || key === "vim_down") && index < $items.length - 1) {
        index += 1;
    } else if ((key === "up_arrow" || key === "vim_up") && index > 0) {
        index -= 1;
    }
    $items.eq(index).trigger("focus");
}

export function focus_first_action_popover_item() {
    // For now I recommend only calling this when the user opens the menu with a hotkey.
    // Our popup menus act kind of funny when you mix keyboard and mouse.
    const $items = get_action_menu_menu_items();
    focus_first_popover_item($items);
}

export function hide_userlist_sidebar() {
    $(".app-main .column-right").removeClass("expanded");
}

export function show_userlist_sidebar() {
    $(".app-main .column-right").addClass("expanded");
    resize.resize_page_components();
}

// On mobile web, opening the keyboard can trigger a resize event
// (which in turn can trigger a scroll event).  This will have the
// side effect of closing popovers, which we don't want.  So we
// suppress the first hide from scrolling after a resize using this
// variable.
let suppress_scroll_hide = false;

export function set_suppress_scroll_hide() {
    suppress_scroll_hide = true;
}

export function register_click_handlers() {
    {
        let last_scroll = 0;

        $(document).on("scroll", () => {
            if (suppress_scroll_hide) {
                suppress_scroll_hide = false;
                return;
            }

            const date = Date.now();

            // only run `popovers.hide_all()` if the last scroll was more
            // than 250ms ago.
            if (date - last_scroll > 250) {
                hide_all();
            }

            // update the scroll time on every event to make sure it doesn't
            // retrigger `hide_all` while still scrolling.
            last_scroll = date;
        });
    }
}

export function any_active() {
    // True if any popover (that this module manages) is currently shown.
    // Expanded sidebars on mobile view count as popovers as well.
    return (
        popover_menus.any_active() ||
        stream_popover.is_open() ||
        user_group_popover.is_open() ||
        user_card_popover.user_sidebar_popped() ||
        user_card_popover.is_message_user_card_open() ||
        user_card_popover.is_user_card_open() ||
        emoji_picker.is_open() ||
        playground_links_popover.is_open() ||
        $("[class^='column-'].expanded").length
    );
}

// This function will hide all true popovers (the streamlist and
// userlist sidebars use the popover infrastructure, but doesn't work
// like a popover structurally).
export function hide_all_except_sidebars(opts) {
    $(".has_popover").removeClass("has_popover has_actions_popover has_emoji_popover");
    if (!opts || !opts.not_hide_tippy_instances) {
        // hideAll hides all tippy instances (tooltips and popovers).
        hideAll();
    }
    emoji_picker.hide_emoji_popover();
    stream_popover.hide_stream_popover();
    user_group_popover.hide();
    user_card_popover.hide_all_user_card_popovers();
    playground_links_popover.hide();

    // look through all the popovers that have been added and removed.
    for (const $o of list_of_popovers) {
        if (!document.body.contains($o.$element[0]) && $o.$tip) {
            $o.$tip.remove();
        }
    }
    list_of_popovers = [];
}

// This function will hide all the popovers, including the mobile web
// or narrow window sidebars.
export function hide_all(not_hide_tippy_instances) {
    hide_userlist_sidebar();
    stream_popover.hide_streamlist_sidebar();
    hide_all_except_sidebars({
        not_hide_tippy_instances,
    });
}

export function initialize() {
    overlays.register_pre_open_hook(hide_all);
    overlays.register_pre_close_hook(hide_all);
}
