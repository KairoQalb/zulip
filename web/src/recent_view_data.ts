import * as people from "./people";
import {get_key_from_message} from "./recent_view_util";
import type {Message} from "./types";

export type TopicData = {
    last_msg_id: number;
    participated: boolean;
    type: "private" | "stream";
};
export const topics = new Map<string | undefined, TopicData>();
// For stream messages, key is stream-id:topic.
// For pms, key is the user IDs to whom the message is being sent.

export function process_message(msg: Message): boolean {
    // Return whether any conversation data is updated.
    let conversation_data_updated = false;

    // Initialize conversation data
    const key = get_key_from_message(msg);
    let topic_data = topics.get(key);
    if (topic_data === undefined) {
        topic_data = {
            last_msg_id: -1,
            participated: false,
            type: msg.type,
        };
        topics.set(key, topic_data);
        conversation_data_updated = true;
    }
    // Update conversation data
    if (topic_data.last_msg_id < msg.id) {
        // NOTE: This also stores locally echoed msg_id which
        // has not been successfully received from the server.
        // We store it now and reify it when response is available
        // from server.
        topic_data.last_msg_id = msg.id;
        conversation_data_updated = true;
    }
    // TODO: Add backend support for participated topics.
    // Currently participated === recently participated
    // i.e. Only those topics are participated for which we have the user's
    // message fetched in the topic. Ideally we would want this to be attached
    // to topic info fetched from backend, which is currently not a thing.
    if (!topic_data.participated && people.is_my_user_id(msg.sender_id)) {
        topic_data.participated = true;
        conversation_data_updated = true;
    }
    return conversation_data_updated;
}

function get_sorted_topics(): Map<string | undefined, TopicData> {
    // Sort all recent topics by last message time.
    return new Map([...topics.entries()].sort((a, b) => b[1].last_msg_id - a[1].last_msg_id));
}

export function get(): Map<string | undefined, TopicData> {
    return get_sorted_topics();
}

export function reify_message_id_if_available(opts: {old_id: number; new_id: number}): boolean {
    // We don't need to reify the message_id of the topic
    // if a new message arrives in the topic from another user,
    // since it replaces the last_msg_id of the topic which
    // we were trying to reify.
    for (const value of topics.values()) {
        if (value.last_msg_id === opts.old_id) {
            value.last_msg_id = opts.new_id;
            return true;
        }
    }
    return false;
}
