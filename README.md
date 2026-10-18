<p align="center">
  <img src="./assets/logo.svg" alt="Squishh Logo" width="360" />
</p>

<p align="center">
  <strong>100% Offline, Private, and Hardware-Accelerated Media Compression for Android</strong><br>
  Built with React 19, TypeScript, Capacitor 8.5, and Native Kotlin engines (Jetpack Media3 & Android Graphics/PDF).
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Android_14_--_15-3DDC84?style=flat&logo=android&logoColor=white" alt="Platform">
  <img src="https://img.shields.io/badge/Privacy-100%25_Offline-blue?style=flat&logo=shield" alt="Privacy">
  <img src="https://img.shields.io/badge/Engine-Jetpack_Media3-FF6F00?style=flat" alt="Media3">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat" alt="License">
</p>

---

## 🌟 Philosophy

Most media compression tools upload your personal photos, videos, and private documents to remote cloud servers. **Squishh** is engineered from the ground up for **zero-telemetry, on-device privacy**.

* 🔒 **Zero Internet Permission**: The release APK explicitly removes the `android.permission.INTERNET` flag. Your data physically cannot leave your phone.
* ⚡ **Hardware Accelerated**: Leverages device `MediaCodec` silicon chips via Jetpack Media3 for rapid video and audio transcoding.
* 🧹 **Zero Cache Footprint**: Features an instant native cleanup service that wipes temporary cache files the moment the app closes or is swiped away.
* 🎨 **Refined Dark Aesthetic**: Minimalist, tactile dark interface with smooth GSAP animations and responsive haptics.

---

## 🚀 Workflows & Capabilities

### 📸 1. Photos & Images
* **Compress by Target Size**: Enter an exact target in KB or MB (e.g. `< 500 KB` or `< 1.5 MB`). An intelligent binary-search compression algorithm finds the highest possible visual quality to hit your limit without overshoot.
* **Compress by Quality**: Fine-tune with a 1–100% quality slider.
* **Smart Format Preservation**: Automatically matches the input image format (JPG, PNG, WebP) or converts to your desired format.
* **Batch Processing**: Select multiple images for parallel native background compression.
* **Compare Slider**: Interactive before/after split viewer to inspect quality before saving or sharing.

### 🎥 2. Video & Animated GIFs
* **3 Dedicated Compression Levels**:
  * **Light**: ~25% reduction (`~75%` size). Pristine quality preservation keeping original resolution and high bitrates.
  * **Balanced**: ~50% reduction (`~50%` size). Optimal everyday compression with smart HD downscaling.
  * **High**: ~80% reduction (`~20%` size). Maximum compression with compact downscaling for fast sharing over chat apps.
* **Custom Resolution & Frames**: Manually control resolution (1080p, 720p, 480p, 360p) and frame rates (60, 30, 24 fps).
* **Video to Animated GIF**: Convert any video clip into an optimized 256-color looping animated GIF.
* **Mute Audio Option**: Strip audio tracks with one tap to save extra bytes.
* **Embedded Player**: Inspect and play the compressed video output in-app before exporting.

### 📄 3. Native PDF Engine
* **Zero Third-Party Bloat**: Built purely using Android SDK's native `PdfRenderer` and `PdfDocument` APIs.
* **PDF Compression**: 3 tuned presets (**Light** `~20%`, **Balanced** `~45-50%`, **Highly** `~80-90%`) utilizing custom direct DCT streaming (`JpegPdfWriter`) to shrink heavy PDF documents without file bloat.
* **Combine Photos to PDF**: Select multiple images or receipt scans, reorder pages freely with drag/arrow controls, and export a clean PDF.
* **Extract PDF Pages**: Convert PDF documents into individual high-resolution image files.

### 🎵 4. Audio & Soundtrack Extractor
* **Universal Audio Squish**: Transcode to M4A (AAC), MP3, or WAV with selectable bitrates (64, 128, 192, 256, 320 kbps).
* **Video Soundtrack Extractor**: Extract audio tracks from video files (MP4, MKV, MOV, WebM) with zero hassle.
* **Mono Downmix**: Halve voice note file sizes with single-channel downmixing.
* **Built-in Audio Player**: Listen to your squished audio with live soundwave equalizer animations.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | React 19, TypeScript, Vite 8 |
| **Styling** | Tailwind CSS v4 |
| **Motion & Gestures** | GSAP 3 (`@gsap/react`, `Flip`) |
| **Native Bridge** | Capacitor 8.5 |
| **Native Video Engine** | AndroidX Jetpack Media3 (`media3-transformer`, `media3-effect`, `MediaCodec`) |
| **Native Graphics Engine** | Android `BitmapFactory`, `ImageDecoder`, `android.graphics.pdf` |
| **Icons & Fonts** | Lucide React, Plus Jakarta Sans, Inter, JetBrains Mono |

---

## 📂 Project Structure

```
squishh/
├── android/                             # Native Android Platform
│   ├── app/
│   │   ├── build.gradle                 # Media3, Coroutines, 16 KB page-size configuration
│   │   └── src/main/
│   │       ├── AndroidManifest.xml      # Zero internet, Foreground Service, Share Intent filters
│   │       └── java/com/prakhar/squishh/
│   │           ├── MainActivity.kt      # Plugin registration, incoming share intent handling
│   │           ├── SquishhEnginePlugin.kt# Two-way Capacitor native bridge
│   │           ├── ImageProcessor.kt    # Binary-search target size compression
│   │           ├── VideoProcessor.kt    # Media3 Transformer & animated GIF encoder
│   │           ├── AudioProcessor.kt    # Audio transcoding & video soundtrack extractor
│   │           ├── PdfProcessor.kt      # Native PDF renderer & JpegPdfWriter pipeline
│   │           ├── CacheCleaner.kt      # Instant cache purging engine
│   │           ├── SquishhCleanupService.kt # Lifecycle service for cache cleanup on task kill
│   │           ├── StorageResolver.kt   # Scoped Storage content URI resolver
│   │           ├── MediaExporter.kt     # MediaStore public gallery exporter
│   │           └── SquishhProcessingService.kt # Foreground notification progress updater
│   └── build.gradle
├── src/                                 # Web Application Layer (React 19)
│   ├── components/
│   │   ├── ui/                          # SquishhButton, ModeSwitcher (GSAP Flip)
│   │   ├── AmbientBackground.tsx        # Battery-aware GSAP floating canvas
│   │   ├── ImageWorkflow.tsx            # Photo picker, target size, Before/After compare
│   │   ├── VideoWorkflow.tsx            # Video compressor, 3 levels, player
│   │   ├── AudioWorkflow.tsx            # Audio/Video picker, soundwave visualizer, audio player
│   │   ├── PdfWorkflow.tsx              # Photos to PDF, Compress PDF, PDF to Images, reordering
│   │   └── BatchQueueManager.tsx        # Batch queue drawer with item cancellation
│   ├── plugins/
│   │   └── squishhEngine.ts             # TypeScript definitions for native Android bridge
│   ├── services/
│   │   ├── engineManager.ts             # Central engine orchestrator & web fallback simulations
│   │   └── haptics.ts                   # Tactile haptic feedback triggers
│   ├── lib/
│   │   └── gsap.ts                      # GSAP & Flip plugin registration
│   ├── App.tsx                          # App shell, tab manager, share intent receiver
│   ├── main.tsx                         # React entrypoint
│   └── index.css                        # Tailwind v4, design tokens & safe area insets
├── capacitor.config.ts                  # Capacitor configuration
└── package.json
```

---

## 🏗️ Getting Started

### Prerequisites
* **Node.js**: v20 or higher
* **Java Development Kit**: JDK 20 or JDK 21 LTS
* **Android SDK**: API 34+ with Platform Tools installed

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
npx cap copy android
```

### 4. Build Debug APK
```bash
cd android
$env:JAVA_HOME = "C:\Program Files\Java\jdk-20" # (or your JDK 20/21 path)
.\gradlew assembleDebug
```
The output APK will be generated at:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

### 5. Build Release APK (Lean & Signed)
```bash
cd android
.\gradlew assembleRelease
```

---

## 🔒 Security & Privacy Guarantee

1. **No Network Access**: The release manifest explicitly removes the internet permission:
   ```xml
   <uses-permission android:name="android.permission.INTERNET" tools:node="remove" />
   ```
2. **Local Storage Scoping**: Processed media is saved exclusively through Android's `MediaStore` API into public user folders (`Pictures/Squishh`, `Movies/Squishh`, `Music/Squishh`, `Download/Squishh`).
3. **Automatic Cache Erasure**: Temporary transcoding and compression artifacts in cache directories are wiped upon application termination.

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.