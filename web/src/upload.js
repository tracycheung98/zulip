import {Uppy} from "@uppy/core";
import XHRUpload from "@uppy/xhr-upload";
import $ from "jquery";

import render_upload_banner from "../templates/compose_banner/upload_banner.hbs";

import * as compose_actions from "./compose_actions";
import * as compose_state from "./compose_state";
import * as compose_ui from "./compose_ui";
import {csrf_token} from "./csrf";
import {$t} from "./i18n";
import {page_params} from "./page_params";

// Show the upload button only if the browser supports it.
export function feature_check($upload_button) {
    if (window.XMLHttpRequest && new window.XMLHttpRequest().upload) {
        $upload_button.removeClass("notdisplayed");
    }
}

export function get_translated_status(file) {
    const status = $t({defaultMessage: "Uploading {filename}…"}, {filename: file.name});
    return "[" + status + "]()";
}

export function get_item(key, config, file_id) {
    if (!config) {
        throw new Error("Missing config");
    }
    if (config.mode === "compose") {
        switch (key) {
            case "textarea":
                return $("#compose-textarea");
            case "send_button":
                return $("#compose-send-button");
            case "banner_container":
                return $("#compose_banners");
            case "upload_banner_identifier":
                return `#compose_banners .upload_banner.file_${CSS.escape(file_id)}`;
            case "upload_banner":
                return $(`#compose_banners .upload_banner.file_${CSS.escape(file_id)}`);
            case "upload_banner_close_button":
                return $(
                    `#compose_banners .upload_banner.file_${CSS.escape(
                        file_id,
                    )} .compose_banner_close_button`,
                );
            case "upload_banner_message":
                return $(`#compose_banners .upload_banner.file_${CSS.escape(file_id)} .upload_msg`);
            case "file_input_identifier":
                return "#compose .file_input";
            case "source":
                return "compose-file-input";
            case "drag_drop_container":
                return $("#compose");
            case "markdown_preview_hide_button":
                return $("#compose .undo_markdown_preview");
            default:
                throw new Error(`Invalid key name for mode "${config.mode}"`);
        }
    } else if (config.mode === "edit") {
        if (!config.row) {
            throw new Error("Missing row in config");
        }
        switch (key) {
            case "textarea":
                return $(`#edit_form_${CSS.escape(config.row)} .message_edit_content`);
            case "send_button":
                return $(`#edit_form_${CSS.escape(config.row)} .message_edit_content`)
                    .closest(".message_edit_form")
                    .find(".message_edit_save");
            case "banner_container":
                return $(`#edit_form_${CSS.escape(config.row)} .edit_form_banners`);
            case "upload_banner_identifier":
                return `#edit_form_${CSS.escape(config.row)} .upload_banner.file_${CSS.escape(
                    file_id,
                )}`;
            case "upload_banner":
                return $(
                    `#edit_form_${CSS.escape(config.row)} .upload_banner.file_${CSS.escape(
                        file_id,
                    )}`,
                );
            case "upload_banner_close_button":
                return $(
                    `#edit_form_${CSS.escape(config.row)} .upload_banner.file_${CSS.escape(
                        file_id,
                    )} .compose_banner_close_button`,
                );
            case "upload_banner_message":
                return $(
                    `#edit_form_${CSS.escape(config.row)} .upload_banner.file_${CSS.escape(
                        file_id,
                    )} .upload_msg`,
                );
            case "file_input_identifier":
                return `#edit_form_${CSS.escape(config.row)} .file_input`;
            case "source":
                return "message-edit-file-input";
            case "drag_drop_container":
                return $(`#zfilt${CSS.escape(config.row)} .message_edit_form`);
            case "markdown_preview_hide_button":
                return $(`#edit_form_${CSS.escape(config.row)} .undo_markdown_preview`);
            default:
                throw new Error(`Invalid key name for mode "${config.mode}"`);
        }
    } else {
        throw new Error("Invalid upload mode!");
    }
}

export function hide_upload_banner(uppy, config, file_id) {
    get_item("upload_banner", config, file_id).remove();
    if (uppy.getFiles().length === 0) {
        get_item("send_button", config).prop("disabled", false);
    }
}

function add_upload_banner(config, banner_type, banner_text, file_id) {
    const new_banner = render_upload_banner({
        banner_type,
        banner_text,
        file_id,
    });
    get_item("banner_container", config).append(new_banner);
}

export function show_error_message(
    config,
    message = $t({defaultMessage: "An unknown error occurred."}),
    file_id = null,
) {
    get_item("send_button", config).prop("disabled", false);
    if (file_id) {
        $(`${get_item("upload_banner_identifier", config, file_id)} .moving_bar`).hide();
        get_item("upload_banner", config, file_id).removeClass("info").addClass("error");
        get_item("upload_banner_message", config).text(message);
    } else {
        // We still use a "file_id" (that's not actually related to a file)
        // to differentiate this banner from banners that *are* associated
        // with files. This is notably relevant for the close click handler.
        add_upload_banner(config, "error", message, "generic_error");
    }
}

export async function upload_files(uppy, config, files) {
    if (files.length === 0) {
        return;
    }
    if (page_params.max_file_upload_size_mib === 0) {
        show_error_message(
            config,
            $t({
                defaultMessage: "File and image uploads have been disabled for this organization.",
            }),
        );
        return;
    }

    // If we're looking at a markdown preview, switch back to the edit
    // UI.  This is important for all the later logic around focus
    // (etc.) to work correctly.
    //
    // We implement this transition through triggering a click on the
    // toggle button to take advantage of the existing plumbing for
    // handling the compose and edit UIs.
    if (get_item("markdown_preview_hide_button", config).is(":visible")) {
        get_item("markdown_preview_hide_button", config).trigger("click");
    }

    get_item("send_button", config).prop("disabled", true);

    for (const file of files) {
        try {
            compose_ui.insert_syntax_and_focus(
                get_translated_status(file),
                get_item("textarea", config),
                "block",
                1,
            );
            compose_ui.autosize_textarea(get_item("textarea", config));
            file.id = uppy.addFile({
                source: get_item("source", config),
                name: file.name,
                type: file.type,
                data: file,
            });
        } catch {
            // Errors are handled by info-visible and upload-error event callbacks.
            continue;
        }

        add_upload_banner(
            config,
            "info",
            $t({defaultMessage: "Uploading {filename}…"}, {filename: file.name}),
            file.id,
        );
        get_item("upload_banner_close_button", config, file.id).one("click", () => {
            compose_ui.replace_syntax(
                get_translated_status(file),
                "",
                get_item("textarea", config),
            );
            compose_ui.autosize_textarea(get_item("textarea", config));
            get_item("textarea", config).trigger("focus");

            uppy.removeFile(file.id);
            hide_upload_banner(uppy, config, file.id);
        });
    }
}

export function setup_upload(config) {
    const uppy = new Uppy({
        debug: false,
        autoProceed: true,
        restrictions: {
            maxFileSize: page_params.max_file_upload_size_mib * 1024 * 1024,
        },
        locale: {
            strings: {
                exceedsSize: $t(
                    {
                        defaultMessage:
                            "%'{file}' exceeds the maximum file size for attachments ({variable} MB).",
                    },
                    {variable: `${page_params.max_file_upload_size_mib}`},
                ),
                failedToUpload: $t({defaultMessage: "Failed to upload %'{file}'"}),
            },
        },
    });
    uppy.setMeta({
        csrfmiddlewaretoken: csrf_token,
    });
    uppy.use(XHRUpload, {
        endpoint: "/json/user_uploads",
        formData: true,
        fieldName: "file",
        // Number of concurrent uploads
        limit: 5,
        locale: {
            strings: {
                timedOut: $t({
                    defaultMessage: "Upload stalled for %'{seconds}' seconds, aborting.",
                }),
            },
        },
    });

    uppy.on("upload-progress", (file, progress) => {
        const percent_complete = (100 * progress.bytesUploaded) / progress.bytesTotal;
        $(`${get_item("upload_banner_identifier", config, file.id)} .moving_bar`).css({
            width: `${percent_complete}%`,
        });
    });

    $("body").on("change", get_item("file_input_identifier", config), (event) => {
        const files = event.target.files;
        upload_files(uppy, config, files);
        get_item("textarea", config).trigger("focus");
        event.target.value = "";
    });

    // These are close-click handlers for error banners that aren't associated
    // with a particular file.
    $("#compose_banners").on(
        "click",
        ".upload_banner.file_generic_error .compose_banner_close_button",
        (event) => {
            event.preventDefault();
            $(event.target).parents(".upload_banner").remove();
        },
    );

    $("#edit_form_banners").on(
        "click",
        ".upload_banner.file_generic_error .compose_banner_close_button",
        (event) => {
            event.preventDefault();
            $(event.target).parents(".upload_banner").remove();
        },
    );

    const $drag_drop_container = get_item("drag_drop_container", config);
    $drag_drop_container.on("dragover", (event) => event.preventDefault());
    $drag_drop_container.on("dragenter", (event) => event.preventDefault());

    $drag_drop_container.on("drop", (event) => {
        event.preventDefault();
        const files = event.originalEvent.dataTransfer.files;
        if (config.mode === "compose" && !compose_state.composing()) {
            compose_actions.respond_to_message({trigger: "file drop or paste"});
        }
        upload_files(uppy, config, files);
    });

    $drag_drop_container.on("paste", (event) => {
        const clipboard_data = event.clipboardData || event.originalEvent.clipboardData;
        if (!clipboard_data) {
            return;
        }
        const items = clipboard_data.items;
        const files = [];
        for (const item of items) {
            if (item.kind !== "file") {
                continue;
            }
            const file = item.getAsFile();
            files.push(file);
        }
        if (config.mode === "compose" && !compose_state.composing()) {
            compose_actions.respond_to_message({trigger: "file drop or paste"});
        }
        upload_files(uppy, config, files);
    });

    uppy.on("upload-success", (file, response) => {
        const url = response.body.uri;
        if (url === undefined) {
            return;
        }
        const split_url = url.split("/");
        const filename = split_url.at(-1);
        const filename_url = "[" + filename + "](" + url + ")";
        compose_ui.replace_syntax(
            get_translated_status(file),
            filename_url,
            get_item("textarea", config),
        );
        compose_ui.autosize_textarea(get_item("textarea", config));

        // The uploaded files should be removed since uppy doesn't allow files in the store
        // to be re-uploaded again.
        uppy.removeFile(file.id);
        // Hide upload status after waiting 100ms after the 1s transition to 100%
        // so that the user can see the progress bar at 100%.
        setTimeout(() => {
            hide_upload_banner(uppy, config, file.id);
        }, 1100);
    });

    uppy.on("info-visible", () => {
        // Uppy's `info-visible` event is issued after appending the
        // notice details into the list of event events accessed via
        // uppy.getState().info. Extract the notice details so that we
        // can potentially act on the error.
        //
        // TODO: Ideally, we'd be using the `.error()` hook or
        // something, not parsing error message strings.
        const infoList = uppy.getState().info;
        const info = infoList[infoList.length - 1];
        if (info.type === "error" && info.message === "No Internet connection") {
            // server_events already handles the case of no internet.
            return;
        }

        if (info.type === "error" && info.details === "Upload Error") {
            // The server errors come under 'Upload Error'. But we can't handle them
            // here because info object don't contain response.body.msg received from
            // the server. Server errors are hence handled by on('upload-error').
            return;
        }

        if (info.type === "error") {
            // The remaining errors are mostly frontend errors like file being too large
            // for upload.
            show_error_message(config, info.message);
        }
    });

    uppy.on("upload-error", (file, error, response) => {
        const message = response ? response.body.msg : undefined;
        show_error_message(config, message, file.id);
        compose_ui.replace_syntax(get_translated_status(file), "", get_item("textarea", config));
        compose_ui.autosize_textarea(get_item("textarea", config));
    });

    uppy.on("restriction-failed", (file) => {
        compose_ui.replace_syntax(get_translated_status(file), "", get_item("textarea", config));
        compose_ui.autosize_textarea(get_item("textarea", config));
    });

    return uppy;
}
