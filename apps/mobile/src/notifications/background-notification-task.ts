import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { z } from "zod";
import { AppState, Platform } from "react-native";
import { notificationReplySchema } from "@/data/notifications/notification-reply";
import { handleNotificationReply } from "./notification-reply";
import {
  parseDismissedThreadId,
  presentedNotificationIdsForThread,
} from "@/data/notifications";

const BACKGROUND_NOTIFICATION_TASK = "bb-dismiss-read-thread-notifications";

async function dismissThread(threadId: string): Promise<number> {
  const presented = await Notifications.getPresentedNotificationsAsync();
  const identifiers = presentedNotificationIdsForThread(
    presented.map((notification) => ({
      identifier: notification.request.identifier,
      data: notification.request.content.data,
    })),
    threadId,
  );
  await Promise.all(
    identifiers.map((identifier) =>
      Notifications.dismissNotificationAsync(identifier),
    ),
  );
  return identifiers.length;
}

async function processNotification(data: unknown) {
  const envelope = z
    .object({
      data: z.object({ bbNotificationReply: z.unknown() }),
    })
    .safeParse(data);
  const reply = notificationReplySchema.safeParse(
    envelope.success ? envelope.data.data.bbNotificationReply : data,
  );
  if (reply.success) {
    try {
      await handleNotificationReply(reply.data);
      return Notifications.BackgroundNotificationTaskResult.NewData;
    } catch {
      console.warn("Could not send a notification reply");
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Reply not sent",
          body: "Open this thread and try sending your message again.",
          data: {
            ...reply.data.notification.request.content.data,
            kind: "message",
          },
        },
        trigger: null,
      }).catch(() => {
        console.warn("Could not show the notification reply failure");
      });
      return Notifications.BackgroundNotificationTaskResult.Failed;
    }
  }
  const threadId = parseDismissedThreadId(data);
  if (threadId === null) {
    return Notifications.BackgroundNotificationTaskResult.NoData;
  }
  return (await dismissThread(threadId)) > 0
    ? Notifications.BackgroundNotificationTaskResult.NewData
    : Notifications.BackgroundNotificationTaskResult.NoData;
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  BACKGROUND_NOTIFICATION_TASK,
  ({ data, error }) =>
    error
      ? Promise.resolve(Notifications.BackgroundNotificationTaskResult.Failed)
      : processNotification(data),
);

if (Platform.OS === "android") {
  Notifications.addNotificationResponseReceivedListener((response) => {
    if (AppState.currentState === "active") void processNotification(response);
  });
}

Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(
  (error: unknown) => {
    console.warn("Could not register the background notification task", error);
  },
);
