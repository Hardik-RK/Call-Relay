package dev.quickdial

import android.content.Context
import java.util.Locale

/**
 * Pairing result and preferences, kept in app-private SharedPreferences.
 *
 * The device token is stored unencrypted. App-private storage is protected by the OS sandbox
 * (and allowBackup is off), but a rooted phone could read it. The token only allows polling for
 * and reporting on this phone's own commands, and can be revoked from the web page.
 */
class Settings(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("quick_dial", Context.MODE_PRIVATE)

    var serverUrl: String?
        get() = prefs.getString("server_url", null)
        set(v) = prefs.edit().putString("server_url", v).apply()

    var token: String?
        get() = prefs.getString("token", null)
        set(v) = prefs.edit().putString("token", v).apply()

    var listening: Boolean
        get() = prefs.getBoolean("listening", false)
        set(v) = prefs.edit().putBoolean("listening", v).apply()

    var callPermissionAsked: Boolean
        get() = prefs.getBoolean("call_permission_asked", false)
        set(v) = prefs.edit().putBoolean("call_permission_asked", v).apply()

    var country: Country
        get() = Country.fromCode(prefs.getString("country", "") ?: "")
            ?: Country.fromCode(Locale.getDefault().country)
            ?: Country.IN
        set(v) = prefs.edit().putString("country", v.code).apply()

    val isPaired: Boolean get() = !serverUrl.isNullOrEmpty() && !token.isNullOrEmpty()

    fun clearPairing() {
        prefs.edit().remove("server_url").remove("token").putBoolean("listening", false).apply()
    }
}
