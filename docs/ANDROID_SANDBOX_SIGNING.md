# Android sandbox signing

PackProof sandbox release builds use a signing key that is deliberately separate from the default Android debug key and any future Play production key. The private keystore and passwords must remain outside the repository.

## Tracked configuration

`plugins/with-packproof-gradle-properties.js` generates an optional `sandbox` signing configuration in `android/app/build.gradle`. The configuration is enabled only when:

```text
PACKPROOF_ANDROID_SIGNING_PROFILE=sandbox
```

The build fails closed when the profile is unsupported, a required value is missing, or the keystore path is not a file.

Required process-environment variables:

```text
PACKPROOF_ANDROID_SIGNING_PROFILE
PACKPROOF_ANDROID_KEYSTORE_PATH
PACKPROOF_ANDROID_KEY_ALIAS
PACKPROOF_ANDROID_KEYSTORE_PASSWORD
PACKPROOF_ANDROID_KEY_PASSWORD
```

Do not put the passwords in `.env`, `.env.example`, Gradle properties, command-line arguments, CI logs, issue text, or source control. Use a local credential manager or CI/EAS secret variables and expose them only to the build process.

## Reproducible local sequence

The preferred local sequence is the interactive wrapper below. It prompts without echoing or persisting either password, exposes the values only to the build process and clears the five signing environment variables when the process finishes:

```powershell
.\scripts\build-sandbox-apk.ps1
```

The wrapper defaults to the current replacement sandbox key filename and alias under the operator's `.packproof\credentials` directory. Override `-KeystorePath`, `-KeyAlias`, or `-OutputPath` explicitly when rotating the sandbox identity again; the passwords remain interactive and are never supplied as command-line arguments.

For CI or a credential-manager-backed process, populate the five environment variables without printing their values, then run:

```powershell
npx.cmd expo prebuild --platform android --clean --no-install
.\android\gradlew.bat -p android :app:signingReport --no-daemon
.\android\gradlew.bat -p android :app:assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a
```

For a multi-ABI artifact, omit `-PreactNativeArchitectures=arm64-v8a` and use the repository's configured architecture list.

After building, verify the package, certificate, APK signature and alignment with the latest installed Android SDK Build Tools:

```powershell
aapt.exe dump badging .\android\app\build\outputs\apk\release\app-release.apk
apksigner.bat verify --verbose --print-certs .\android\app\build\outputs\apk\release\app-release.apk
zipalign.exe -c -v 4 .\android\app\build\outputs\apk\release\app-release.apk
```

The sandbox certificate is an internal device-test identity. It is not a Play upload key, Play App Signing key, or production release approval.

## Regression gate

Run:

```powershell
npm.cmd run test:android-signing-plugin
```

The test verifies idempotent generation, fail-fast behavior when the Expo Gradle template changes, preservation of the debug signing selection, and profile-aware release signing.
