import AppIntents
import Foundation

// PilotCalc： weight & balance、燃油换算、时间/单位换算。
// 意图层的两个功能都是飞行前真会问的那两句："我这一趟 W&B 合不合规""这箱油多少磅"。
// 全部是确定性的算术，不读 App 数据库，落地即用。

@available(iOS 16.0, *)
enum FuelUnit: String, AppEnum {
  case gallons
  case litres
  case pounds

  static var typeDisplayRepresentation: TypeDisplayRepresentation = TypeDisplayRepresentation(name: "Fuel unit")
  static var caseDisplayRepresentations: [FuelUnit: DisplayRepresentation] = [
    .gallons: DisplayRepresentation(title: "US gallons"),
    .litres: DisplayRepresentation(title: "Litres"),
    .pounds: DisplayRepresentation(title: "Pounds"),
  ]
}

@available(iOS 16.0, *)
struct FuelTypeEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = TypeDisplayRepresentation(name: "Fuel grade")
  static var defaultQuery = FuelTypeQuery()

  let id: String
  let summary: String
  /// Nominal mass in pounds per US gallon at 15 °C.
  let poundsPerGallon: Double

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(summary)", subtitle: "\(poundsPerGallon) lb/gal")
  }

  static let all: [FuelTypeEntity] = [
    FuelTypeEntity(id: "avgas-100ll", summary: "Avgas 100LL", poundsPerGallon: 6.0),
    FuelTypeEntity(id: "avgas-100", summary: "Avgas 100", poundsPerGallon: 6.0),
    FuelTypeEntity(id: "jet-a", summary: "Jet A / A-1", poundsPerGallon: 6.7),
    FuelTypeEntity(id: "mogas", summary: "MOGAS (auto fuel)", poundsPerGallon: 6.0),
  ]
}

@available(iOS 16.0, *)
struct FuelTypeQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [FuelTypeEntity] {
    FuelTypeEntity.all.filter { identifiers.contains($0.id) }
  }

  func suggestedEntities() async throws -> [FuelTypeEntity] {
    FuelTypeEntity.all
  }

  func defaultResult() async -> FuelTypeEntity? {
    FuelTypeEntity.all.first
  }
}

@available(iOS 16.0, *)
private enum PCFuel {
  static let litresPerGallon = 3.785_411_784

  static func gallons(quantity: Double, unit: FuelUnit, poundsPerGallon: Double) -> Double {
    switch unit {
    case .gallons:
      return quantity
    case .litres:
      return quantity / litresPerGallon
    case .pounds:
      return poundsPerGallon > 0 ? quantity / poundsPerGallon : 0
    }
  }

  static func rounded(_ value: Double, _ digits: Int) -> String {
    String(format: "%.\(digits)f", value)
  }
}

@available(iOS 16.0, *)
struct FuelMassIntent: AppIntent {
  static var title: LocalizedStringResource = "Convert fuel"
  static var description: IntentDescription? = IntentDescription(
    "Converts fuel between US gallons, litres and pounds for a chosen grade, so you can check both the volume and the weight."
  )
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Quantity", requestValueDialog: "How much fuel?")
  var quantity: Double

  @Parameter(title: "Unit")
  var unit: FuelUnit

  @Parameter(title: "Fuel grade")
  var fuel: FuelTypeEntity

  static var parameterSummary: some ParameterSummary {
    Summary("Convert \(\.$quantity) \(\.$unit) of \(\.$fuel)")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard quantity >= 0 else {
      return .result(dialog: "Fuel quantity cannot be negative.")
    }
    let gal = PCFuel.gallons(quantity: quantity, unit: unit, poundsPerGallon: fuel.poundsPerGallon)
    let pounds = gal * fuel.poundsPerGallon
    let litres = gal * PCFuel.litresPerGallon
    let line1 = PCFuel.rounded(gal, 1) + " US gal, " + PCFuel.rounded(litres, 1) + " L, "
      + PCFuel.rounded(pounds, 0) + " lb"
    let line2 = " at " + PCFuel.rounded(fuel.poundsPerGallon, 1) + " lb/gal for " + fuel.summary + "."
    return .result(dialog: IntentDialog(stringLiteral: line1 + line2))
  }
}

@available(iOS 16.0, *)
struct WeightBalanceIntent: AppIntent {
  static var title: LocalizedStringResource = "Weight and balance"
  static var description: IntentDescription? = IntentDescription(
    "Adds empty weight, front and rear occupants and usable fuel into a total weight, moment and centre of gravity, then checks them against your gross weight and CG limits."
  )
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Empty weight (lb)", requestValueDialog: "What is the empty weight?")
  var emptyWeight: Double

  @Parameter(title: "Empty arm (in)", requestValueDialog: "What is the empty-weight arm?")
  var emptyArm: Double

  @Parameter(title: "Front weight (lb)", default: 0)
  var frontWeight: Double

  @Parameter(title: "Front arm (in)", default: 0)
  var frontArm: Double

  @Parameter(title: "Rear weight (lb)", default: 0)
  var rearWeight: Double

  @Parameter(title: "Rear arm (in)", default: 0)
  var rearArm: Double

  @Parameter(title: "Fuel (US gal)", default: 0)
  var fuelGallons: Double

  @Parameter(title: "Fuel arm (in)", default: 0)
  var fuelArm: Double

  @Parameter(title: "Max gross weight (lb)", requestValueDialog: "What is the maximum gross weight?")
  var maxGrossWeight: Double

  @Parameter(title: "CG limit forward (in)", default: 0)
  var cgForward: Double

  @Parameter(title: "CG limit aft (in)", default: 0)
  var cgAft: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Weight and balance at \(\.$fuelGallons) gal fuel")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let fuelWeight = max(fuelGallons, 0) * 6.0
    let totalWeight = emptyWeight + frontWeight + rearWeight + fuelWeight
    guard totalWeight > 0 else {
      return .result(dialog: "Total weight came out at zero. Give me the empty weight at least.")
    }
    let moment = emptyWeight * emptyArm + frontWeight * frontArm + rearWeight * rearArm + fuelWeight * fuelArm
    let cg = moment / totalWeight

    var issues: [String] = []
    if maxGrossWeight > 0 && totalWeight > maxGrossWeight {
      let over = totalWeight - maxGrossWeight
      issues.append(PCFuel.rounded(over, 0) + " lb over gross")
    }
    if cgForward > 0 && cg < cgForward {
      issues.append("CG " + PCFuel.rounded(cgForward - cg, 2) + " in forward of the limit")
    }
    if cgAft > 0 && cg > cgAft {
      issues.append("CG " + PCFuel.rounded(cg - cgAft, 2) + " in aft of the limit")
    }

    let head = "Total " + PCFuel.rounded(totalWeight, 0) + " lb, CG " + PCFuel.rounded(cg, 2) + " in."
    let verdict = issues.isEmpty
      ? " Inside every limit you gave me."
      : " Not legal: " + issues.joined(separator: ", ") + "."
    return .result(dialog: IntentDialog(stringLiteral: head + verdict))
  }
}

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
      intent: WeightBalanceIntent(),
      phrases: [
        "Weight and balance in \(.applicationName)",
        "Check my loading in \(.applicationName)",
      ],
      shortTitle: "Weight & balance",
      systemImageName: "scalemass"
    )
    AppShortcut(
      intent: FuelMassIntent(),
      phrases: [
        "Convert fuel in \(.applicationName)",
        "How heavy is my fuel in \(.applicationName)",
      ],
      shortTitle: "Convert fuel",
      systemImageName: "fuelpump"
    )
    AppShortcut(
      intent: PilotCalcOpenIntent(),
      phrases: ["Open \(.applicationName)", "Launch \(.applicationName)"],
      shortTitle: "Open PilotCalc",
      systemImageName: "airplane"
    )
  }
}
