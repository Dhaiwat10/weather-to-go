# Weather To Go

Weather To Go is a conversational weather app for iPhone. It answers the practical question—“what is it like outside?”—before showing the full forecast.

Instead of displaying the same checklist every day, it only surfaces advice when the weather makes it useful: take an umbrella when rain is genuinely plausible, dress lighter during meaningful heat, add layers when it will actually feel cold, or use sunscreen when UV is high. Hourly and seven-day forecasts remain visible for context, and home-screen widgets provide the short version at a glance.

## Highlights

- Practical, condition-aware weather guidance
- Same-local-hour comparisons with yesterday
- Current-location weather and city or postal-code search
- Hourly and seven-day forecasts
- Small and medium iOS home-screen widgets
- Metric and imperial units based on locale, with a remembered toggle
- No account, login, backend, or API key

## Data and privacy

Forecasts and place search use [Open-Meteo](https://open-meteo.com/). Location permission is requested by iOS on first launch. If permission is denied or location cannot be read, the app falls back to Surat, Gujarat. Only the selected location and unit preference are stored on-device.

Weather comparisons match the previous local calendar date and clock hour instead of subtracting 24 elapsed hours, which avoids daylight-saving errors.

## Run locally

Requirements: Node.js, npm, Xcode, and an iOS Simulator.

```bash
git clone https://github.com/Dhaiwat10/weather-to-go.git
cd weather-to-go
npm install
npm run ios
```

The native development build includes the widget extension. For JavaScript-only development, run `npm start` after the first native build.

## Checks

```bash
npm run typecheck
npm test
npx expo export --platform ios
```

The app is built with Expo 54, React Native, TypeScript, WidgetKit, SF Symbols, and Open-Meteo.
