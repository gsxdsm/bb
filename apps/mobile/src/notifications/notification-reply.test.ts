import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  entries: new Map<string, string>(),
  cookies: vi.fn(async () => undefined),
  dismiss: vi.fn(async () => undefined),
  category: vi.fn(async () => null),
  failure: vi.fn(async () => "failure-notification"),
  task: vi.fn<(body: { data: unknown; error?: Error }) => Promise<number>>(),
  presented: vi.fn<
    () => Promise<
      Array<{
        request: {
          identifier: string;
          content: { data: Record<string, string> };
        };
      }>
    >
  >(async () => []),
  platform: "ios",
  appState: { currentState: "background" },
  listener: vi.fn<(response: unknown) => void>(),
}));

vi.mock("expo-notifications", () => ({
  dismissNotificationAsync: native.dismiss,
  setNotificationCategoryAsync: native.category,
  scheduleNotificationAsync: native.failure,
  registerTaskAsync: vi.fn(async () => null),
  addNotificationResponseReceivedListener: vi.fn(
    (listener: (response: unknown) => void) => {
      native.listener.mockImplementation(listener);
      return { remove: vi.fn() };
    },
  ),
  getPresentedNotificationsAsync: native.presented,
  BackgroundNotificationTaskResult: { NewData: 0, NoData: 1, Failed: 2 },
}));
vi.mock("expo-task-manager", () => ({
  defineTask: (
    _name: string,
    executor: (body: { data: unknown; error?: Error }) => Promise<number>,
  ) => {
    native.task.mockImplementation(executor);
  },
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return native.platform;
    },
  },
  AppState: native.appState,
}));
vi.mock("@/lib/native/cookie-store", () => ({
  nativeCookieStore: { set: native.cookies },
}));
vi.mock("@/lib/native/preferences-storage", () => ({
  getPreferencesStorage: () => ({
    getString: (key: string) => native.entries.get(key),
    set: (key: string, value: string) => {
      native.entries.set(key, value);
    },
    remove: (key: string) => {
      native.entries.delete(key);
    },
  }),
}));
vi.mock("@/lib/native/profile-store", () => ({
  getProfileStore: () => ({
    load: async () => ({
      profiles: [
        {
          id: "profile-1",
          mode: "connect",
          serverUrl: "https://bb.example.test",
          handle: "bb",
          credential: "test-credential",
        },
      ],
    }),
  }),
}));
vi.mock("./push-storage", () => ({
  getPushStore: () => ({
    reload: () => undefined,
    getSnapshot: () => ({
      registrations: { "profile-1": { subscriptionId: "subscription-1" } },
    }),
  }),
}));

import {
  handleNotificationReply,
  registerNotificationReplyCategory,
} from "./notification-reply";

import "./background-notification-task";

beforeEach(() => {
  vi.clearAllMocks();
  native.entries.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  native.platform = "ios";
  native.appState.currentState = "background";
});

describe("native notification reply delivery", () => {
  it("renews Connect authentication and sends the reply through the normal SDK route", async () => {
    const requestFetch = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/connect/desktop-session")) {
        expect(new Headers(init?.headers).get("x-bb-connect-machine")).toBe(
          "test-credential",
        );
        return Response.json({
          cookie: {
            domain: "bb.example.test",
            expiresAt: Date.now() + 60_000,
            name: "session",
            value: "test-session",
          },
        });
      }
      expect(native.cookies).toHaveBeenCalledTimes(2);
      expect(url).toBe("https://bb.example.test/api/v1/threads/thread-1/send");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        input: [{ type: "text", text: "Continue" }],
        mode: "queue-if-active",
      });
      return Response.json({ ok: true, delivery: "sent" });
    });
    vi.stubGlobal("fetch", requestFetch);
    await registerNotificationReplyCategory();
    expect(native.category).toHaveBeenCalledWith("bb-thread-reply", [
      expect.objectContaining({
        identifier: "bb-reply",
        textInput: {
          submitButtonTitle: "Send",
          placeholder: "Message this thread",
        },
        options: {
          opensAppToForeground: false,
          isAuthenticationRequired: true,
        },
      }),
    ]);
    expect(
      await handleNotificationReply({
        actionIdentifier: "bb-reply",
        userText: "Continue",
        notification: {
          request: {
            identifier: "request-1",
            content: {
              data: { threadId: "thread-1", subscriptionId: "subscription-1" },
            },
          },
        },
      }),
    ).toBe(true);
    expect(requestFetch).toHaveBeenCalledTimes(2);
    expect(native.dismiss).toHaveBeenCalledWith("request-1");
  });
});

describe("background notification task", () => {
  it.each(["ios", "android"])(
    "sends a %s reply without mounting the app UI",
    async (platform) => {
      const requestFetch = vi.fn<typeof fetch>(async (input) => {
        if (String(input).endsWith("/api/connect/desktop-session")) {
          return Response.json({
            cookie: {
              domain: "bb.example.test",
              expiresAt: Date.now() + 60_000,
              name: "session",
              value: "test-session",
            },
          });
        }
        return Response.json({ ok: true, delivery: "queued" });
      });
      vi.stubGlobal("fetch", requestFetch);
      const response = {
        actionIdentifier: "bb-reply",
        userText: "Background reply",
        notification: {
          request: {
            identifier: `background-${platform}`,
            content: {
              data: { threadId: "thread-1", subscriptionId: "subscription-1" },
            },
          },
        },
      };
      const data =
        platform === "ios"
          ? { data: { bbNotificationReply: response } }
          : response;
      expect(await native.task({ data })).toBe(0);
      const sends = requestFetch.mock.calls.filter(([url]) =>
        String(url).endsWith("/api/v1/threads/thread-1/send"),
      );
      expect(sends).toHaveLength(1);
      expect(JSON.parse(String(sends[0]?.[1]?.body))).toMatchObject({
        input: [{ type: "text", text: "Background reply" }],
        mode: "queue-if-active",
      });
      expect(native.dismiss).toHaveBeenCalledWith(`background-${platform}`);
      expect(native.failure).not.toHaveBeenCalled();
    },
  );

  it("shows a notification when a background reply cannot be sent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(
      await native.task({
        data: {
          actionIdentifier: "bb-reply",
          userText: "Retry this reply",
          notification: {
            request: {
              identifier: "background-failure",
              content: {
                data: {
                  threadId: "thread-1",
                  subscriptionId: "subscription-1",
                  projectId: "project-1",
                  serverUrl: "https://bb.example.test",
                },
              },
            },
          },
        },
      }),
    ).toBe(2);
    expect(native.failure).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "Reply not sent",
          data: expect.objectContaining({
            threadId: "thread-1",
            projectId: "project-1",
            serverUrl: "https://bb.example.test",
          }),
        }),
      }),
    );
    expect(native.dismiss).not.toHaveBeenCalled();
  });
});

describe("notification delivery lifecycle", () => {
  it("continues dismissing read-thread notifications through the registered task", async () => {
    native.presented.mockResolvedValueOnce([
      {
        request: {
          identifier: "read-notification",
          content: { data: { threadId: "read-thread" } },
        },
      },
      {
        request: {
          identifier: "other-notification",
          content: { data: { threadId: "other-thread" } },
        },
      },
    ]);
    expect(
      await native.task({
        data: {
          data: {
            dataString: JSON.stringify({
              kind: "dismiss",
              threadId: "read-thread",
            }),
          },
        },
      }),
    ).toBe(0);
    expect(native.dismiss.mock.calls).toEqual([["read-notification"]]);
  });

  it("sends from Android's active listener and leaves background callbacks to the task", async () => {
    native.platform = "android";
    native.appState.currentState = "active";
    vi.resetModules();
    await import("./background-notification-task");
    const requestFetch = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/api/connect/desktop-session")) {
        return Response.json({
          cookie: {
            domain: "bb.example.test",
            expiresAt: Date.now() + 60_000,
            name: "session",
            value: "test-session",
          },
        });
      }
      return Response.json({ ok: true, delivery: "queued" });
    });
    vi.stubGlobal("fetch", requestFetch);
    const response = {
      actionIdentifier: "bb-reply",
      userText: "Active Android reply",
      notification: {
        request: {
          identifier: "active-android",
          content: {
            data: { threadId: "thread-1", subscriptionId: "subscription-1" },
          },
        },
      },
    };
    native.listener(response);
    await vi.waitFor(() =>
      expect(native.dismiss).toHaveBeenCalledWith("active-android"),
    );
    expect(
      requestFetch.mock.calls.filter(([url]) =>
        String(url).endsWith("/api/v1/threads/thread-1/send"),
      ),
    ).toHaveLength(1);
    native.appState.currentState = "background";
    native.listener({
      ...response,
      notification: {
        request: {
          ...response.notification.request,
          identifier: "background-owned",
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requestFetch).toHaveBeenCalledTimes(2);
  });
});
