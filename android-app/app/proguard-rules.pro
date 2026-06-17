# OkHttp
-dontwarn okhttp3.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# ML Kit
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**

# Kotlin coroutines
-keepnames class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# JSON
-keep class org.json.** { *; }

# WebSocket listener callbacks (referenced via reflection by OkHttp)
-keep class com.phonebridge.connection.** { *; }
-keep class com.phonebridge.services.** { *; }
