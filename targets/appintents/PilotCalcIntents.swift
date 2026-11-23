import AppIntents
import Foundation

// PilotCalc：只做「打开 App」这一条，不带任何数据读取——该产品没有与扩展共享的存储。
@available(iOS 16.0, *)
struct PilotCalcOpenIntent: AppIntent {
  static var title: LocalizedStringResource = "Open PilotCalc"
  static var description: IntentDescription? = IntentDescription(
    "Opens PilotCalc: weight and balance, fuel and time-unit conversions."
  )
  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    return .result()
  }
}

@available(iOS 16.0, *)
struct PilotCalcShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: PilotCalcOpenIntent(),
      phrases: ["Open \(.applicationName)", "Launch \(.applicationName)"],
      shortTitle: "Open PilotCalc",
      systemImageName: "airplane"
    )
  }
}
