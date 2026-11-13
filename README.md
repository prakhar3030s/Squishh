<p align="center">
  <img src="./assets/logo.svg" alt="Squishh Logo" width="360" />
</p>

<p align="center">
  <strong>100% Offline, Private, and Hardware-Accelerated Media Compression for Android</strong><br>
  Built with React 19, TypeScript, Capacitor 8.5, Koin DI, and Native Kotlin engines (Jetpack Media3 & Android Graphics/PDF).
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Android_14_--_15-3DDC84?style=flat&logo=android&logoColor=white" alt="Platform">
  <img src="https://img.shields.io/badge/Privacy-100%25_Offline-blue?style=flat&logo=shield" alt="Privacy">
  <img src="https://img.shields.io/badge/Tests-54%20Passing-brightgreen?style=flat&logo=vitest" alt="Tests">
  <img src="https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=flat&logo=github-actions&logoColor=white" alt="CI">
  <img src="https://img.shields.io/badge/Engine-Jetpack_Media3-FF6F00?style=flat" alt="Media3">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat" alt="License">
</p>

---

## 🌟 Philosophy

Most media compression tools upload your personal photos, videos, and private documents to remote cloud servers. **Squishh** is engineered from the ground up for **zero-telemetry, on-device privacy**.

* 🔒 **Zero Internet Permission**: The release APK explicitly removes the `android.permission.INTERNET` and `android.permission.ACCESS_NETWORK_STATE` flags. Your data physically cannot leave your phone.
* ⚡ **Hardware Accelerated**: Leverages device `MediaCodec` silicon chips via Jetpack Media3 for rapid video and audio transcoding.
* 🧹 **Zero Cache Footprint**: Features an instant native cleanup service that wipes temporary cache files the moment the app closes or is swiped away.
* 🎨 **Refined Dark Aesthetic**: Minimalist, tactile dark interface aligned end-to-end with dark splash/status bar theming, adaptive tablet layouts, smooth GSAP animations, and responsive haptics.

---

## 🚀 Workflows & Capabilities

### 📸 1. Photos & Images
* **Compress by Target Size**: Enter an exact target in KB or MB (e.g. `< 500 KB` or `< 1.5 MB`). An intelligent binary-search compression algorithm finds the highest possible visual quality to hit your limit without overshoot.
* **Compress by Quality**: Fine-tune with a 10–95% quality slider.
* **Smart Format Preservation**: Automatically matches the input image format (JPG, PNG, WebP) or converts to your desired format (including AVIF where supported).
* **Batch Processing**: Select multiple images for parallel native background compression with an expandable batch queue drawer.
* **Compare Slider**: Interactive draggable & keyboard-accessible before/after split viewer to inspect visual quality before saving or sharing.

### 🎥 2. Video & Animated GIFs
* **3 Dedicated Compression Levels**:
  * **Light**: ~25% reduction (`~75%` size). Pristine quality preservation keeping original resolution and high bitrates.
  * **Balanced**: ~50% reduction (`~50%` size). Optimal everyday compression with smart HD downscaling.
  * **High**: ~80% reduction (`~22%` size). Maximum compression with compact downscaling for fast sharing over chat apps.
* **Custom Resolution & Frames**: Manually control resolution (1080p, 720p, 480p, 360p) and frame rates (60, 30, 24 fps).
* **Video to Animated GIF**: Stream any video clip into an optimized 256-color looping animated GIF scaled to 360 px width, with exact output dimensions displayed in the result summary.
* **Mute Audio Option**: Strip audio tracks with one tap to save extra bytes.
* **Embedded Player**: Inspect and play the compressed video or GIF output in-app before exporting.

### 📄 3. Native PDF Engine
* **Zero Third-Party Bloat**: Built purely using Android SDK's native `PdfRenderer` and custom `JpegPdfWriter` APIs.
* **PDF Compression**: 3 tuned presets (**Light** `~20%`, **Balanced** `~45-50%`, **Highly** `~80-90%`) utilizing direct DCT streaming (`JpegPdfWriter`) to shrink heavy PDF documents without file bloat.
* **Combine Photos to PDF**: Select multiple images or receipt scans, reorder pages freely with pointer drag-and-drop handles or arrow buttons, and export a clean PDF.
* **Extract PDF Pages**: Convert PDF documents into individual JPG or PNG image files.

### 🎵 4. Audio & Soundtrack Extractor
* **M4A (AAC) Transcoding**: Compresses incoming audio (MP3, AAC, WAV, FLAC, M4A, OGG) into **M4A (AAC)** containers with selectable bitrates (`64`, `96`, `128`, `192`, `256`, `320` kbps). *Note: Because Android Jetpack Media3 encodes natively to AAC, M4A (AAC) is the sole audio output format (MP3 and WAV output encoding are not supported).*
* **Video Soundtrack Extractor**: Extract audio tracks from video files (MP4, MKV, MOV, WebM) straight to M4A (AAC).
* **Mono Downmix**: Halve voice note file sizes with single-channel downmixing (`ChannelMixingAudioProcessor`).
* **Built-in Audio Player**: Listen to your squished audio with a live Web Audio `AnalyserNode`-driven soundwave equalizer active during playback.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | React 19, TypeScript, Vite 8 |
| **Styling** | Tailwind CSS v4 (responsive phone single-column & `>=768px` adaptive two-column layouts) |
| **Web Architecture & DI** | Shared `useWorkflow` state machine, `WorkflowStageUI` shell, React Context DI (`ServiceContext`) |
| **Motion & Gestures** | GSAP 3 (`@gsap/react`, `Flip`) |
| **Native Bridge & Plugins** | Capacitor 8.5 with a lean 4-plugin setup (`@capacitor/app`, `@capacitor/haptics`, `@capacitor/splash-screen`, `@capacitor/status-bar`) + custom `SquishhEngine` bridge |
| **Native DI & Architecture** | Koin 4.0.2 DI, `FileRepository`, split bridge controllers (`JobCancellationManager`, `ForegroundProgressController`, `ShareHandler`), typed `@BridgeContract` models |
| **Native Video Engine** | AndroidX Jetpack Media3 (`media3-transformer`, `media3-effect`, `MediaCodec`) & streaming LZW GIF encoder |
| **Native Graphics Engine** | Android `BitmapFactory`, `ImageDecoder`, `android.graphics.pdf` |
| **Testing & CI** | Vitest 5, React Testing Library, JSDOM, JUnit 4, Robolectric, MockK, CoroutinesTest, Koin Test, JaCoCo, GitHub Actions |
| **Icons & Fonts** | Lucide React, Plus Jakarta Sans, Inter, JetBrains Mono |

---

## 📂 Project Structure

```
squishh/
├── .github/workflows/
│   └── android-ci.yml                   # Automated CI: npm test, cap sync, gradlew testDebugUnitTest & assembleDebug
├── android/                             # Native Android Platform
│   ├── app/
│   │   ├── build.gradle                 # Media3, Koin DI, Coroutines, JaCoCo, 16 KB page-size config
│   │   ├── proguard-rules.pro           # R8 keep rules for Capacitor bridge & Koin graph
│   │   └── src/
│   │       ├── main/
│   │       │   ├── AndroidManifest.xml  # Zero internet, SquishhApplication, Foreground Service, Share filters
│   │       │   └── java/com/prakhar/squishh/
│   │       │       ├── SquishhApplication.kt        # Koin DI bootstrap (`startKoin`)
│   │       │       ├── AppModule.kt                 # Koin singleton module graph
│   │       │       ├── BridgeModels.kt              # @BridgeContract data classes & JSObject mappers
│   │       │       ├── FileRepository.kt            # Centralized storage, export & cache abstraction
│   │       │       ├── MainActivity.kt              # Native WebView file chooser, share intent & runtime permissions
│   │       │       ├── SquishhEnginePlugin.kt       # Two-way Capacitor native bridge dispatch
│   │       │       ├── JobCancellationManager.kt    # Thread-safe single & batch job cancellation registry
│   │       │       ├── ForegroundProgressController.kt # Processing notification service controller
│   │       │       ├── ShareHandler.kt              # Off-main-thread FileProvider share chooser launcher
│   │       │       ├── ImageProcessor.kt            # Binary-search target size compression & bitmap downsampling
│   │       │       ├── VideoProcessor.kt            # Media3 Transformer & streaming animated GIF encoder
│   │       │       ├── AudioProcessor.kt            # M4A (AAC) transcoding & video soundtrack extractor
│   │       │       ├── PdfProcessor.kt              # Native PDF renderer & JpegPdfWriter pipeline
│   │       │       ├── CacheCleaner.kt              # Async cache purging engine
│   │       │       ├── SquishhCleanupService.kt     # Task-kill cache cleanup service
│   │       │       ├── StorageResolver.kt           # Scoped Storage content URI resolver
│   │       │       ├── MediaExporter.kt             # MediaStore public gallery exporter
│   │       │       └── SquishhProcessingService.kt  # Foreground notification progress updater
│   │       └── test/
│   │           ├── resources/robolectric.properties # Robolectric Android SDK 34 config
│   │           └── java/com/prakhar/squishh/
│   │               ├── ImageProcessorTest.kt        # Anti-ballooning ratio & format bounds
│   │               ├── VideoProcessorTest.kt        # Compression level bitrate monotonicity & floors
│   │               ├── AudioProcessorTest.kt        # Bitrate clamping & mono downmix coefficients
│   │               ├── PdfProcessorTest.kt          # PDF 1.4 spec, xref table & PdfRenderer compatibility
│   │               ├── GifEncoderTest.kt            # 9-bit LZW sub-block chunking & 254-px clear codes
│   │               ├── StorageResolverAndMediaExporterTest.kt # MIME lookup & MediaStore routing
│   │               ├── CacheCleanerTest.kt          # Directory size & async cache clearing
│   │               └── SquishhEngineTest.kt         # Lifecycle cancel & Koin DI graph validation
│   └── build.gradle
├── src/                                 # Web Application Layer (React 19)
│   ├── components/
│   │   ├── ui/                          # SquishhButton, SquishhCard, ModeSwitcher (GSAP Flip), BeforeAfterSlider
│   │   ├── workflow/WorkflowStageUI.tsx # Shared dropzone, error alert, progress card & adaptive done shell
│   │   ├── AmbientBackground.tsx        # Battery-aware GSAP floating canvas
│   │   ├── ImageWorkflow.tsx            # Photo picker, target size, draggable Before/After compare
│   │   ├── VideoWorkflow.tsx            # Video compressor, presets/FPS/GIF, player
│   │   ├── AudioWorkflow.tsx            # Audio/Video picker, AnalyserNode playback equalizer, audio player
│   │   ├── PdfWorkflow.tsx              # Photos to PDF (drag/arrow reorder), Compress PDF, PDF to Images
│   │   └── BatchQueueManager.tsx        # Expandable batch queue drawer with item cancellation
│   ├── constants/compression.ts         # Named compression, quality chip & storage threshold constants
│   ├── hooks/useWorkflow.ts             # Shared workflow state machine & concurrency helper
│   ├── plugins/
│   │   ├── bridgeSchema.ts              # Canonical TS bridge schema, payloads & event constants
│   │   └── squishhEngine.ts             # Capacitor plugin registration & web dev fallbacks
│   ├── services/
│   │   ├── ServiceContext.tsx           # React Context DI (`SquishhServicesProvider`)
│   │   ├── engineManager.ts             # Central engine orchestrator & error humanizer
│   │   └── haptics.ts                   # Tactile haptic feedback triggers
│   ├── test/                            # Web Unit & Integration Tests (Vitest)
│   │   ├── setup.ts                     # JSDOM polyfills, Web Audio & matchMedia mocks
│   │   ├── engineManager.test.ts        # Format helpers, error dictionary & listener registry
│   │   ├── batchQueueProgress.test.ts   # Overall progress math & cancelled/failed exclusion
│   │   ├── workflowComponents.test.tsx  # React Testing Library component tests across 4 workflows
│   │   └── e2e.test.tsx                 # App integration E2E: share intake -> compress -> save
│   ├── lib/gsap.ts                      # GSAP & Flip plugin registration
│   ├── App.tsx                          # Adaptive app shell, mode tabs & incoming share intake
│   ├── main.tsx                         # React entrypoint with ServiceProvider
│   └── index.css                        # Tailwind v4, design tokens & safe area insets
├── capacitor.config.ts                  # Capacitor 4-plugin configuration & dark splash/status bar theme
├── vitest.config.ts                     # Vitest test runner configuration
└── package.json
```

---

## 🏗️ Getting Started

### Prerequisites
* **Node.js**: v20 or higher
* **Java Development Kit**: JDK 21 LTS (resolved via `JAVA_HOME`, Android Studio's JBR, or Gradle `jvmToolchain(21)`)
* **Android SDK**: API 36 build tools / Platform Tools configured via `ANDROID_HOME` or Android Studio-generated `android/local.properties`

### 1. Clone & Install
```bash
git clone https://github.com/<your-username>/squishh.git
cd squishh
npm install
```

### 2. Build Web Assets
```bash
npm run build
```

### 3. Sync to Android
```bash
npx cap sync android
```

### 4. Build Debug APK
```bash
cd android
./gradlew assembleDebug
```
The output APKs will be generated under:
```
android/app/build/outputs/apk/debug/
```

### 5. Build Release APK (Shrunk & Signed)
Copy `android/keystore.properties.example` to `android/keystore.properties` (gitignored) with your release keystore credentials, then run:
```bash
cd android
./gradlew assembleRelease
```

---

## 🧪 Testing & Quality Assurance

Squishh includes an automated test suite spanning both the web and native Android layers (54 tests total, 0 failures):

### 1. Web Unit, Component & E2E Tests (Vitest + RTL + JSDOM)
```bash
# Run all web tests
npm test

# Run tests in watch mode
npx vitest

# Run with UI
npx vitest --ui
```
* **EngineManager & Bridge Tests**: Validates format helpers (`formatBytes`, `formatEta`), bridge error translation dictionary (`humanizeError`), and listener registration.
* **Batch Queue Progress Math**: Asserts progress averaging across items, clamping, and exclusion of aborted/failed items from denominator (`batchQueueProgress.test.ts`).
* **Workflow Component Tests**: Validates stage progression, sub-mode switching, format toggling, haptic triggers, and error banners across all 4 workflows via React Testing Library (`workflowComponents.test.tsx`).
* **Narrow E2E Integration**: Simulates incoming Android share intake, automatic file resolution, compression pipeline, and gallery export (`e2e.test.tsx`).

### 2. Native Android Unit Tests (JUnit 4 + MockK + Robolectric)
```bash
cd android

# Run all Android unit tests
./gradlew testDebugUnitTest

# Generate JaCoCo code coverage report
./gradlew jacocoTestReport
```
HTML coverage reports will be available at `android/app/build/reports/jacoco/jacocoTestReport/html/index.html`.

* **ImageProcessorTest**: Verifies anti-ballooning ratio caps, sub-1024 bytes clamping boundary, format resolutions, and coroutine cancellation token propagation.
* **VideoProcessorTest**: Asserts strict bitrate monotonicity across compression levels, estimated size ratio bounds, minimum bitrate floors, and audio-mute bitrate reallocations.
* **AudioProcessorTest**: Verifies bitrate bounds clamping ([32..320 kbps]), mono downmixing coefficient matrix (`1f / channels`), and default M4A format assertion.
* **PdfProcessorTest**: Verifies PDF 1.4 binary spec conformance, `%PDF-1.4` magic header, xref offset table, trailer catalog structure, and Robolectric `PdfRenderer` compatibility.
* **GifEncoderTest**: Tests GIF89a header, screen descriptor, GCT palette, NETSCAPE2.0 looping extension, and 9-bit LZW sub-block chunking with periodic 254-pixel Clear codes.
* **StorageResolverAndMediaExporterTest**: Validates MIME type detection tables, MediaStore export path routing, and missing file exception handling.
* **CacheCleanerTest**: Tests recursive cache size calculation and asynchronous deletion with task synchronization.
* **SquishhEngineTest**: Verifies single and batch job cancellation registries and Koin dependency injection graph completeness.

### 3. Continuous Integration (GitHub Actions)
Every push and pull request to `main` automatically triggers [.github/workflows/android-ci.yml](file:///d:/squishh/.github/workflows/android-ci.yml):
1. Installs Node.js & dependencies (`npm ci`).
2. Builds web assets (`npm run build`).
3. Runs web unit and integration tests (`npm test`).
4. Syncs Capacitor Android assets (`npx cap sync android`).
5. Executes Android unit tests (`./gradlew testDebugUnitTest`).
6. Builds the Debug APK artifact (`./gradlew assembleDebug`).

---

## 📋 Pre-Push Verification One-Liner

Before committing and pushing changes to GitHub, you can run this command chain to verify that everything compiles, passes all 54 tests, and produces a valid APK:

```bash
npm run build && npm test && npx cap sync android && cd android && ./gradlew testDebugUnitTest assembleDebug
```

---

## 🔒 Security & Privacy Guarantee

1. **No Network Access**: The release manifest explicitly removes internet and network-state permissions:
   ```xml
   <uses-permission android:name="android.permission.INTERNET" tools:node="remove" />
   <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" tools:node="remove" />
   ```
2. **Local Storage Scoping**: Processed media is saved exclusively through Android's `MediaStore` API into public user folders (`Pictures/Squishh`, `Movies/Squishh`, `Music/Squishh`, `Download/Squishh`).
3. **Automatic Cache Erasure**: Temporary transcoding and compression artifacts in cache directories are wiped asynchronously upon application startup, exit, and task removal.

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.
