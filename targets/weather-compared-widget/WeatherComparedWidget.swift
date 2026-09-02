import SwiftUI
import WidgetKit

private let appGroup = "group.com.dhaiwat.weathercompared"
private let widgetKind = "WeatherComparedWidget"

struct WeatherConfig: Codable {
    let latitude: Double
    let longitude: Double
    let locationName: String
    let units: String
}

struct WeatherWidgetData: Codable {
    let locationName: String
    let temperature: String
    let condition: String
    let high: String
    let low: String
    let headline: String
    let comparison: String
    let primaryTitle: String
    let primaryDetail: String
    let primaryKind: String?
    let weatherCode: Int?
    let isDay: Int?
    let updatedAt: String

    static let sample = WeatherWidgetData(
        locationName: "My Location",
        temperature: "24°",
        condition: "Partly Cloudy",
        high: "27°",
        low: "19°",
        headline: "Mostly dry for the next few hours.",
        comparison: "3° warmer than this time yesterday.",
        primaryTitle: "Take a light layer",
        primaryDetail: "It’ll feel cooler after dark.",
        primaryKind: "layers",
        weatherCode: 2,
        isDay: 1,
        updatedAt: ISO8601DateFormatter().string(from: Date())
    )
}

struct WeatherEntry: TimelineEntry {
    let date: Date
    let data: WeatherWidgetData
}

private enum SharedWeatherStore {
    static let defaults = UserDefaults(suiteName: appGroup)

    static func decode<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let data = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    static var config: WeatherConfig? {
        decode(WeatherConfig.self, key: "weatherConfig")
    }

    static var snapshot: WeatherWidgetData? {
        decode(WeatherWidgetData.self, key: "weatherSnapshot")
    }
}

struct WeatherTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> WeatherEntry {
        WeatherEntry(date: Date(), data: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (WeatherEntry) -> Void) {
        completion(WeatherEntry(date: Date(), data: SharedWeatherStore.snapshot ?? .sample))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WeatherEntry>) -> Void) {
        Task {
            let stored = SharedWeatherStore.snapshot
            let fresh: WeatherWidgetData?
            if let config = SharedWeatherStore.config {
                fresh = await WeatherLoader.load(config: config)
            } else {
                fresh = nil
            }
            let entry = WeatherEntry(date: Date(), data: fresh ?? stored ?? .sample)
            let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1_800)
            completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
        }
    }
}

private struct ForecastResponse: Decodable {
    let current: CurrentWeather
    let hourly: HourlyWeather
    let daily: DailyWeather
}

private struct CurrentWeather: Decodable {
    let time: String
    let temperature: Double?
    let apparent: Double?
    let humidity: Double?
    let rainChance: Double?
    let rain: Double?
    let wind: Double?
    let code: Int?
    let isDay: Int?

    enum CodingKeys: String, CodingKey {
        case time
        case temperature = "temperature_2m"
        case apparent = "apparent_temperature"
        case humidity = "relative_humidity_2m"
        case rainChance = "precipitation_probability"
        case rain
        case wind = "wind_speed_10m"
        case code = "weather_code"
        case isDay = "is_day"
    }
}

private struct HourlyWeather: Decodable {
    let time: [String]
    let temperature: [Double?]
    let apparent: [Double?]
    let rainChance: [Double?]
    let rain: [Double?]
    let wind: [Double?]
    let code: [Int?]

    enum CodingKeys: String, CodingKey {
        case time
        case temperature = "temperature_2m"
        case apparent = "apparent_temperature"
        case rainChance = "precipitation_probability"
        case rain
        case wind = "wind_speed_10m"
        case code = "weather_code"
    }
}

private struct DailyWeather: Decodable {
    let time: [String]
    let high: [Double?]
    let low: [Double?]
    let rainChance: [Double?]
    let uv: [Double?]

    enum CodingKeys: String, CodingKey {
        case time
        case high = "temperature_2m_max"
        case low = "temperature_2m_min"
        case rainChance = "precipitation_probability_max"
        case uv = "uv_index_max"
    }
}

private enum WeatherLoader {
    static func load(config: WeatherConfig) async -> WeatherWidgetData? {
        var components = URLComponents(string: "https://api.open-meteo.com/v1/forecast")
        components?.queryItems = [
            URLQueryItem(name: "latitude", value: String(config.latitude)),
            URLQueryItem(name: "longitude", value: String(config.longitude)),
            URLQueryItem(name: "timezone", value: "auto"),
            URLQueryItem(name: "past_days", value: "1"),
            URLQueryItem(name: "forecast_days", value: "5"),
            URLQueryItem(name: "current", value: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,rain,wind_speed_10m,weather_code,is_day"),
            URLQueryItem(name: "hourly", value: "temperature_2m,apparent_temperature,precipitation_probability,rain,wind_speed_10m,weather_code"),
            URLQueryItem(name: "daily", value: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max"),
        ]
        guard let url = components?.url else { return nil }

        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
            let forecast = try JSONDecoder().decode(ForecastResponse.self, from: data)
            return summarize(forecast, config: config)
        } catch {
            return nil
        }
    }

    private static func summarize(_ forecast: ForecastResponse, config: WeatherConfig) -> WeatherWidgetData {
        let currentHour = String(forecast.current.time.prefix(13))
        let currentIndex = forecast.hourly.time.firstIndex { String($0.prefix(13)) == currentHour } ?? 0
        let endIndex = min(currentIndex + 12, forecast.hourly.time.count)
        let upcoming = currentIndex < endIndex ? Array(currentIndex..<endIndex) : []

        let apparent = upcoming.compactMap { forecast.hourly.apparent[safe: $0] ?? nil }
        let rainChances = upcoming.compactMap { forecast.hourly.rainChance[safe: $0] ?? nil }
        let winds = upcoming.compactMap { forecast.hourly.wind[safe: $0] ?? nil }
        let codes = upcoming.compactMap { forecast.hourly.code[safe: $0] ?? nil }
        let rainMax = rainChances.max() ?? forecast.current.rainChance ?? 0
        let warmest = apparent.max() ?? forecast.current.apparent ?? 20
        let coolest = apparent.min() ?? forecast.current.apparent ?? 20
        let maxWind = winds.max() ?? forecast.current.wind ?? 0
        let hasStorm = codes.contains { $0 >= 95 }
        let firstPossibleRainIndex = upcoming.first { index in
            let chance = forecast.hourly.rainChance[safe: index] ?? nil
            return (chance ?? 0) >= 25
        }
        let firstWetIndex = upcoming.first { index in
            let rain = forecast.hourly.rain[safe: index] ?? nil
            let code = forecast.hourly.code[safe: index] ?? nil
            return (rain ?? 0) >= 0.1 || isRainOrStormCode(code)
        }
        let rainTimingIndex: Int? = {
            if let firstWetIndex { return firstWetIndex }
            if let firstPossibleRainIndex, firstPossibleRainIndex != currentIndex { return firstPossibleRainIndex }
            return nil
        }()
        let rainTiming = upcomingTimingPhrase(
            targetTime: rainTimingIndex.flatMap { forecast.hourly.time[safe: $0] },
            currentTime: forecast.current.time
        )
        let firstStormIndex = upcoming.first { index in
            let code = forecast.hourly.code[safe: index] ?? nil
            return (code ?? 0) >= 95
        }
        let stormTiming = upcomingTimingPhrase(
            targetTime: firstStormIndex.flatMap { forecast.hourly.time[safe: $0] },
            currentTime: forecast.current.time
        )
        let currentlyWet = (forecast.current.rain ?? 0) >= 0.1 || isRainOrStormCode(forecast.current.code)
        let currentlyStormy = (forecast.current.code ?? 0) >= 95

        let todayDate = String(forecast.current.time.prefix(10))
        let todayIndex = forecast.daily.time.firstIndex(of: todayDate) ?? 0
        let high = forecast.daily.high[safe: todayIndex] ?? nil
        let low = forecast.daily.low[safe: todayIndex] ?? nil
        let todayUV = forecast.daily.uv[safe: todayIndex] ?? nil
        let futureUV = forecast.daily.uv.dropFirst(todayIndex).prefix(5).compactMap { $0 }
        let frequentHighUV = futureUV.filter { $0 >= 6 }.count >= 3

        var choices: [(priority: Int, kind: String, title: String, detail: String)] = []
        if rainMax >= 25 {
            let title = rainMax >= 65 ? "Take an umbrella" : rainMax >= 45 ? "An umbrella is worth it" : "Rain is possible"
            let detail = currentlyWet ? "Expect wet conditions over the next few hours." : "Wet weather is most likely \(rainTiming)."
            choices.append((rainMax >= 85 ? 100 : rainMax >= 65 ? 84 : rainMax >= 45 ? 67 : 44, "rain", title, detail))
        }
        if warmest >= 35 {
            choices.append((
                warmest >= 39 ? 94 : 73,
                "heat",
                warmest >= 39 ? "Prepare for intense heat" : "Dress light",
                "It could feel like \(temperature(warmest, units: config.units)). Take water."
            ))
        } else if coolest <= 18 {
            let title = coolest <= 5 ? "Wear 3 layers" : coolest <= 12 ? "Wear 2 layers" : "Take 1 light layer"
            let detail = coolest <= 5 ? "A base layer, something warm, and a coat." : coolest <= 12 ? "A top plus a sweater or light jacket." : "A light overshirt or jacket will do."
            choices.append((coolest <= 2 ? 93 : coolest <= 5 ? 76 : coolest <= 12 ? 56 : 36, "layers", title, detail))
        }
        if forecast.current.isDay != 0, let uv = todayUV, uv >= 8 || (uv >= 6 && frequentHighUV) {
            choices.append((uv >= 8 ? 64 : 43, "sun", "Put on sunscreen", "UV reaches \(Int(uv.rounded())) today."))
        }
        if maxWind >= 35 {
            choices.append((maxWind >= 50 ? 88 : 54, "wind", maxWind >= 50 ? "It’ll be properly windy" : "Expect a gusty spell", "Wind picks up over the next few hours."))
        }
        choices.sort { $0.priority > $1.priority }

        let selected = choices.first
        let headline: String
        if hasStorm {
            headline = currentlyStormy ? "Thunderstorms are possible." : "Thunderstorms are possible \(stormTiming)."
        } else if rainMax >= 85 {
            headline = currentlyWet ? "Rain is almost certain." : "Rain is almost certain \(rainTiming)."
        } else if warmest >= 39 {
            headline = "It’ll feel intensely hot."
        } else if coolest <= 2 {
            headline = "It’ll feel bitterly cold."
        } else if rainMax >= 65 {
            headline = currentlyWet ? "Rain is likely." : "Rain is likely \(rainTiming)."
        } else if rainMax >= 45 {
            headline = currentlyWet ? "Rain is about 50/50." : "Rain is about 50/50 \(rainTiming)."
        } else if maxWind >= 50 {
            headline = "Strong winds are likely."
        } else if maxWind >= 35 {
            headline = "A gusty spell is likely."
        } else if forecast.current.code == 45 || forecast.current.code == 48 {
            headline = "Visibility may be low."
        } else if forecast.current.isDay == 0 {
            headline = (forecast.current.apparent ?? 20) <= 18 ? "It’ll feel cool tonight." : "Mostly dry for the next few hours."
        } else if (forecast.current.apparent ?? 20) >= 35 {
            headline = "It’ll feel hot."
        } else if (forecast.current.apparent ?? 20) >= 30 {
            headline = "It’ll feel warm."
        } else {
            headline = "Mostly dry for the next few hours."
        }

        let yesterdayHour = previousDayHour(for: forecast.current.time)
        let yesterdayIndex = yesterdayHour.flatMap { target in
            forecast.hourly.time.firstIndex { String($0.prefix(13)) == target }
        }
        let yesterdayTemperature = yesterdayIndex.flatMap { forecast.hourly.temperature[safe: $0] ?? nil }
        let comparison = comparisonCopy(current: forecast.current.temperature, yesterday: yesterdayTemperature, units: config.units)
        var condition = conditionLabel(code: forecast.current.code, isDay: forecast.current.isDay != 0)
        var primaryTitle = selected?.title ?? condition
        if selected?.kind == "rain",
           let detail = selected?.detail,
           detail.hasPrefix("Wet weather is most likely ") {
            let timing = detail
                .replacingOccurrences(of: "Wet weather is most likely ", with: "")
                .trimmingCharacters(in: CharacterSet(charactersIn: "."))
            let compactTiming: String
            if timing.hasPrefix("later this ") {
                compactTiming = String(timing.dropFirst("later ".count))
            } else if timing == "later tonight" {
                compactTiming = "tonight"
            } else {
                compactTiming = timing
            }

            if selected?.title == "Take an umbrella" {
                primaryTitle = "Rain \(compactTiming)"
            } else {
                primaryTitle = "Rain possible \(compactTiming)"
            }

            if forecast.current.code == 0 {
                condition = "Clear for now"
            } else if let code = forecast.current.code, code <= 2 {
                condition = "Dry for now"
            }
        }

        return WeatherWidgetData(
            locationName: config.locationName,
            temperature: temperature(forecast.current.temperature, units: config.units),
            condition: condition,
            high: temperature(high, units: config.units),
            low: temperature(low, units: config.units),
            headline: headline,
            comparison: comparison,
            primaryTitle: primaryTitle,
            primaryDetail: selected?.detail ?? "",
            primaryKind: selected?.kind,
            weatherCode: forecast.current.code,
            isDay: forecast.current.isDay,
            updatedAt: ISO8601DateFormatter().string(from: Date())
        )
    }

    private static func isRainOrStormCode(_ code: Int?) -> Bool {
        guard let code else { return false }
        return (51...67).contains(code) || (80...82).contains(code) || code >= 95
    }

    private static func upcomingTimingPhrase(targetTime: String?, currentTime: String) -> String {
        guard let targetTime else { return "later" }
        if String(targetTime.prefix(13)) == String(currentTime.prefix(13)) { return "very soon" }
        guard targetTime.count >= 13, let hour = Int(targetTime.dropFirst(11).prefix(2)) else { return "later" }
        if hour < 5 { return "before dawn" }
        if hour < 12 { return "later this morning" }
        if hour < 17 { return "later this afternoon" }
        if hour < 22 { return "later this evening" }
        return "later tonight"
    }

    private static func previousDayHour(for localTime: String) -> String? {
        guard localTime.count >= 13 else { return nil }
        let dateText = String(localTime.prefix(10))
        let hourText = String(localTime.dropFirst(11).prefix(2))
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: dateText),
              let previous = formatter.calendar.date(byAdding: .day, value: -1, to: date) else { return nil }
        return "\(formatter.string(from: previous))T\(hourText)"
    }

    private static func comparisonCopy(current: Double?, yesterday: Double?, units: String) -> String {
        guard let current, let yesterday else { return "" }
        let delta = current - yesterday
        guard abs(delta) >= 1 else { return "" }
        let displayedDelta = units == "imperial" ? abs(delta) * 9 / 5 : abs(delta)
        return "\(max(1, Int(displayedDelta.rounded())))° \(delta > 0 ? "warmer" : "cooler") than this time yesterday."
    }

    private static func temperature(_ celsius: Double?, units: String) -> String {
        guard let celsius else { return "—" }
        let value = units == "imperial" ? celsius * 9 / 5 + 32 : celsius
        return "\(Int(value.rounded()))°"
    }

    private static func conditionLabel(code: Int?, isDay: Bool) -> String {
        guard let code else { return "Mixed conditions" }
        if !isDay && code <= 2 { return "Clear night" }
        if code == 0 { return "Clear" }
        if code <= 2 { return "Partly cloudy" }
        if code == 3 { return "Overcast" }
        if code == 45 || code == 48 { return "Foggy" }
        if (51...57).contains(code) { return "Drizzle" }
        if (61...67).contains(code) || (80...82).contains(code) { return "Rain" }
        if (71...77).contains(code) || (85...86).contains(code) { return "Snow" }
        if code >= 95 { return "Thunderstorms" }
        return "Mixed conditions"
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

private enum WidgetWeatherTheme {
    case clear
    case cloud
    case rain
    case snow
    case storm
    case night

    init(code: Int?, isDay: Int?) {
        if isDay == 0, let code, code <= 2 {
            self = .night
        } else if code == 0 || code == 1 || code == 2 {
            self = .clear
        } else if code == 45 || code == 48 || code == 3 || code == nil || code == -1 {
            self = .cloud
        } else if let code, (71...77).contains(code) || (85...86).contains(code) {
            self = .snow
        } else if let code, code >= 95 {
            self = .storm
        } else {
            self = .rain
        }
    }

    var colors: [Color] {
        switch self {
        case .clear:
            [Color(red: 0.23, green: 0.62, blue: 0.86), Color(red: 0.09, green: 0.42, blue: 0.67), Color(red: 0.03, green: 0.19, blue: 0.33)]
        case .cloud:
            [Color(red: 0.45, green: 0.54, blue: 0.60), Color(red: 0.26, green: 0.37, blue: 0.46), Color(red: 0.11, green: 0.20, blue: 0.29)]
        case .rain:
            [Color(red: 0.33, green: 0.42, blue: 0.48), Color(red: 0.19, green: 0.29, blue: 0.36), Color(red: 0.08, green: 0.16, blue: 0.23)]
        case .snow:
            [Color(red: 0.55, green: 0.65, blue: 0.72), Color(red: 0.35, green: 0.45, blue: 0.53), Color(red: 0.19, green: 0.29, blue: 0.36)]
        case .storm:
            [Color(red: 0.20, green: 0.29, blue: 0.37), Color(red: 0.13, green: 0.21, blue: 0.28), Color(red: 0.04, green: 0.10, blue: 0.16)]
        case .night:
            [Color(red: 0.10, green: 0.19, blue: 0.36), Color(red: 0.06, green: 0.13, blue: 0.25), Color(red: 0.03, green: 0.05, blue: 0.11)]
        }
    }
}

private struct WeatherWidgetBackdrop: View {
    let theme: WidgetWeatherTheme

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                LinearGradient(
                    colors: theme.colors,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                if theme == .clear {
                    Circle()
                        .fill(Color(red: 1, green: 0.86, blue: 0.55).opacity(0.2))
                        .frame(width: proxy.size.width * 0.82)
                        .blur(radius: 18)
                        .offset(x: proxy.size.width * 0.35, y: -proxy.size.height * 0.42)
                }

                if theme == .night {
                    ForEach(0..<9, id: \.self) { index in
                        Circle()
                            .fill(.white.opacity(0.18 + Double(index % 3) * 0.1))
                            .frame(width: index % 4 == 0 ? 2.5 : 1.5)
                            .position(
                                x: proxy.size.width * CGFloat(8 + ((index * 23) % 86)) / 100,
                                y: proxy.size.height * CGFloat(9 + ((index * 31) % 76)) / 100
                            )
                    }
                }

                if theme == .cloud || theme == .rain || theme == .snow || theme == .storm {
                    Ellipse()
                        .fill(.white.opacity(0.07))
                        .frame(width: proxy.size.width * 0.9, height: proxy.size.height * 0.64)
                        .blur(radius: 10)
                        .offset(x: proxy.size.width * 0.34, y: -proxy.size.height * 0.35)
                    Ellipse()
                        .fill(.white.opacity(0.045))
                        .frame(width: proxy.size.width * 0.76, height: proxy.size.height * 0.5)
                        .blur(radius: 12)
                        .offset(x: -proxy.size.width * 0.34, y: proxy.size.height * 0.26)
                }

                if theme == .rain || theme == .storm {
                    ForEach(0..<8, id: \.self) { index in
                        Capsule()
                            .fill(Color(red: 0.84, green: 0.95, blue: 1).opacity(0.09 + Double(index % 2) * 0.035))
                            .frame(width: 1.2, height: 28)
                            .rotationEffect(.degrees(14))
                            .position(
                                x: proxy.size.width * CGFloat(8 + index * 13) / 100,
                                y: proxy.size.height * CGFloat(20 + ((index * 27) % 75)) / 100
                            )
                    }
                }

                if theme == .snow {
                    ForEach(0..<9, id: \.self) { index in
                        Circle()
                            .fill(.white.opacity(0.14 + Double(index % 2) * 0.08))
                            .frame(width: index % 3 == 0 ? 4 : 2.5)
                            .position(
                                x: proxy.size.width * CGFloat(7 + ((index * 19) % 88)) / 100,
                                y: proxy.size.height * CGFloat(12 + ((index * 29) % 80)) / 100
                            )
                    }
                }

                LinearGradient(
                    colors: [.clear, Color(red: 0.01, green: 0.05, blue: 0.10).opacity(0.42)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
        }
    }
}

private struct WidgetGlassModifier: ViewModifier {
    let cornerRadius: CGFloat

    func body(content: Content) -> some View {
        content
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(.white.opacity(0.1))
                    LinearGradient(
                        colors: [.white.opacity(0.08), .clear],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                }
            }
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(.white.opacity(0.18), lineWidth: 0.5)
            }
    }
}

private extension View {
    func widgetGlass(cornerRadius: CGFloat) -> some View {
        modifier(WidgetGlassModifier(cornerRadius: cornerRadius))
    }
}

struct WeatherWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WeatherEntry

    private var theme: WidgetWeatherTheme {
        WidgetWeatherTheme(code: entry.data.weatherCode, isDay: entry.data.isDay)
    }

    private var conditionSymbol: String {
        guard let code = entry.data.weatherCode, code >= 0 else { return "cloud.sun.fill" }
        if entry.data.isDay == 0, code <= 2 { return code == 0 ? "moon.stars.fill" : "cloud.moon.fill" }
        if code == 0 { return "sun.max.fill" }
        if code <= 2 { return "cloud.sun.fill" }
        if code == 3 { return "cloud.fill" }
        if code == 45 || code == 48 { return "cloud.fog.fill" }
        if (51...57).contains(code) { return "cloud.drizzle.fill" }
        if (61...67).contains(code) || (80...82).contains(code) { return "cloud.rain.fill" }
        if (71...77).contains(code) || (85...86).contains(code) { return "cloud.snow.fill" }
        if code >= 95 { return "cloud.bolt.rain.fill" }
        return "cloud.sun.fill"
    }

    private var adviceSymbol: String {
        switch entry.data.primaryKind {
        case "rain", "umbrella": "umbrella.fill"
        case "heat": "thermometer.sun.fill"
        case "layers": "tshirt.fill"
        case "sun": "sun.max.fill"
        case "wind": "wind"
        default: conditionSymbol
        }
    }

    private var compactComparison: String {
        entry.data.comparison.replacingOccurrences(of: "this time ", with: "")
    }

    var body: some View {
        Group {
            if family == .systemMedium {
                mediumView
            } else {
                smallView
            }
        }
        .foregroundStyle(.white)
        .widgetURL(URL(string: "weathercompared://"))
        .containerBackground(for: .widget) {
            WeatherWidgetBackdrop(theme: theme)
        }
    }

    private var locationLabel: some View {
        HStack(spacing: 4) {
            Image(systemName: "location.fill")
                .font(.system(size: 8, weight: .bold))
            Text(entry.data.locationName)
                .font(.caption2.weight(.semibold))
                .lineLimit(1)
        }
        .foregroundStyle(.white.opacity(0.72))
    }

    private var smallView: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                locationLabel
                Spacer(minLength: 5)
                Image(systemName: conditionSymbol)
                    .font(.system(size: 18, weight: .medium))
                    .symbolRenderingMode(.hierarchical)
            }

            Text(entry.data.temperature)
                .font(.system(size: 40, weight: .thin, design: .default))
                .tracking(-1.8)
                .lineLimit(1)
                .padding(.top, -2)

            Text(entry.data.condition)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.white.opacity(0.84))
                .lineLimit(1)

            if !(entry.data.primaryKind ?? "").isEmpty {
                HStack(spacing: 7) {
                    Image(systemName: adviceSymbol)
                        .font(.system(size: 11, weight: .semibold))
                        .frame(width: 13)
                    Text(entry.data.primaryTitle)
                        .font(.system(size: 10.5, weight: .bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.68)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .frame(maxWidth: .infinity, alignment: .leading)
                .widgetGlass(cornerRadius: 11)
                .layoutPriority(3)
                .padding(.top, 6)
            } else {
                Text(entry.data.headline)
                    .font(.system(size: 11.5, weight: .bold))
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .layoutPriority(3)
                    .padding(.top, 6)
            }

            Text(compactComparison.isEmpty ? "H:\(entry.data.high)  L:\(entry.data.low)" : compactComparison)
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(.white.opacity(0.68))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .layoutPriority(1)
                .padding(.top, 4)
        }
    }

    private var mediumView: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                locationLabel

                Text(entry.data.temperature)
                    .font(.system(size: 53, weight: .thin, design: .default))
                    .tracking(-2.5)
                    .padding(.top, 1)

                HStack(spacing: 5) {
                    Image(systemName: conditionSymbol)
                        .font(.system(size: 13, weight: .medium))
                        .symbolRenderingMode(.hierarchical)
                    Text(entry.data.condition)
                        .font(.caption.weight(.medium))
                        .lineLimit(1)
                }

                Text("H:\(entry.data.high)  L:\(entry.data.low)")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.white.opacity(0.68))
                    .padding(.top, 3)
            }
            .frame(width: 112, alignment: .leading)

            VStack(alignment: .leading, spacing: 0) {
                Text(entry.data.headline)
                    .font(.system(size: 16, weight: .bold))
                    .tracking(-0.2)
                    .lineLimit(2)
                    .minimumScaleFactor(0.88)

                Spacer(minLength: 6)

                if !(entry.data.primaryKind ?? "").isEmpty {
                    HStack(spacing: 9) {
                        Image(systemName: adviceSymbol)
                            .font(.system(size: 15, weight: .semibold))
                            .frame(width: 19)

                        VStack(alignment: .leading, spacing: 1) {
                            Text(entry.data.primaryTitle)
                                .font(.caption.weight(.bold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                            Text(entry.data.primaryDetail)
                                .font(.system(size: 10, weight: .regular))
                                .foregroundStyle(.white.opacity(0.72))
                                .lineLimit(2)
                                .minimumScaleFactor(0.84)
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .widgetGlass(cornerRadius: 14)
                }

                Spacer(minLength: 4)

                if !compactComparison.isEmpty {
                    Text(compactComparison)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.7))
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)
                }
            }
        }
    }
}

struct WeatherComparedWidget: Widget {
    let kind = widgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WeatherTimelineProvider()) { entry in
            WeatherWidgetView(entry: entry)
        }
        .configurationDisplayName("Weather To Go")
        .description("What to expect and how to prepare for the weather.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct WeatherComparedWidgetBundle: WidgetBundle {
    var body: some Widget {
        WeatherComparedWidget()
    }
}

#Preview(as: .systemSmall) {
    WeatherComparedWidget()
} timeline: {
    WeatherEntry(date: .now, data: .sample)
}

#Preview(as: .systemMedium) {
    WeatherComparedWidget()
} timeline: {
    WeatherEntry(date: .now, data: .sample)
}
