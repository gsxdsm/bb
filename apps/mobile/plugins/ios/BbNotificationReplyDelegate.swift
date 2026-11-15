internal import ExpoModulesCore
internal import ExpoNotifications
internal import ExpoTaskManager
import UIKit
import UserNotifications

final class BbNotificationReplyDelegate: NSObject, NotificationDelegate {
  private static let shared = BbNotificationReplyDelegate()

  static func install() {
    NotificationCenterManager.shared.addDelegate(shared)
  }

  func didReceive(_ response: UNNotificationResponse, completionHandler: @escaping () -> Void) -> Bool {
    guard response.actionIdentifier == "bb-reply",
      let response = response as? UNTextInputNotificationResponse
    else { return false }

    let request = response.notification.request
    let data: [AnyHashable: Any]
    if request.trigger is UNPushNotificationTrigger {
      guard let payload = request.content.userInfo["body"] as? [String: Any] else { return false }
      data = payload
    } else {
      data = request.content.userInfo
    }
    let payload: [String: Any] = [
      "actionIdentifier": response.actionIdentifier,
      "userText": response.userText,
      "notification": ["request": [
        "identifier": request.identifier,
        "content": ["data": data]
      ]]
    ]
    let run = {
      var backgroundTask = UIBackgroundTaskIdentifier.invalid
      let finish = {
        guard backgroundTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTask)
        backgroundTask = .invalid
      }
      backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "bb-notification-reply", expirationHandler: finish)
      EXTaskService.shared.runTasks(
        with: EXTaskLaunchReasonRemoteNotification,
        userInfo: ["bbNotificationReply": payload]
      ) { _ in
        DispatchQueue.main.async(execute: finish)
      }
    }
    if Thread.isMainThread { run() } else { DispatchQueue.main.sync(execute: run) }
    return true
  }
}
