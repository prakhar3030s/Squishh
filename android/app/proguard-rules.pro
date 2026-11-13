# ProGuard / R8 keep rules for Squishh (Capacitor 8 + Native Kotlin Engine + Media3)

# Preserve stack trace attributes for crash diagnostics
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod
-renamesourcefileattribute SourceFile

# Keep Capacitor application & native bridge components invoked via reflection
-keep class com.prakhar.squishh.SquishhApplication { *; }
-keep class com.prakhar.squishh.AppModuleKt { *; }
-keep class com.prakhar.squishh.MainActivity { *; }
-keep class com.prakhar.squishh.SquishhProcessingService { *; }
-keep class com.prakhar.squishh.SquishhCleanupService { *; }

# Keep Koin DI runtime & injected native graph classes
-keep class * implements org.koin.core.component.KoinComponent { *; }
-keepclassmembers class com.prakhar.squishh.** {
    @org.koin.core.annotation.* *;
}
-keep class com.prakhar.squishh.FileRepository { *; }
-keep class com.prakhar.squishh.DefaultFileRepository { *; }
-keep class com.prakhar.squishh.JobCancellationManager { *; }
-keep class com.prakhar.squishh.ForegroundProgressController { *; }
-keep class com.prakhar.squishh.ShareHandler { *; }
-keep class com.prakhar.squishh.ImageProcessor { *; }
-keep class com.prakhar.squishh.VideoProcessor { *; }
-keep class com.prakhar.squishh.AudioProcessor { *; }
-keep class com.prakhar.squishh.PdfProcessor { *; }
-dontwarn org.koin.**
-keep @com.getcapacitor.annotation.CapacitorPlugin public class com.prakhar.squishh.** {
    public <init>(...);
    @com.getcapacitor.PluginMethod public <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
}
-keep public class * extends com.getcapacitor.Plugin {
    public <init>(...);
    @com.getcapacitor.PluginMethod public <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
}

# Preserve WebView JavascriptInterface methods used by Capacitor bridge
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve FileProvider & custom XML/Service entry points
-keep class androidx.core.content.FileProvider { *; }

# Preserve Kotlin metadata on kept bridge classes & Coroutines ServiceLoader providers
-keep class kotlin.Metadata { *; }
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
