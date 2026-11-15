package dev.quickdial

import android.os.Build
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

class UnauthorizedException : IOException("The server no longer accepts this phone's token")

class ApiException(val status: Int, message: String) : IOException(message)

/** Minimal HTTP client for the three things the phone ever says to the server. */
class Api(private val baseUrl: String, private val token: String? = null) {
    @Volatile private var active: HttpURLConnection? = null

    /** Exchanges a one-time code for a device token. Returns the token. */
    fun pair(code: String): String {
        val body = JSONObject().put("code", code).put("deviceName", Build.MODEL ?: "Android phone")
        val (status, text) = request("POST", "/api/pair", body.toString(), readTimeoutMs = 10_000)
        if (status == 403) throw ApiException(status, "That code is wrong, expired or already used.")
        if (status == 429) throw ApiException(status, "Too many attempts. Wait a minute and try again.")
        if (status != 201) throw ApiException(status, "Server answered $status.")
        val token = JSONObject(text).optString("token", "")
        if (token.isEmpty()) throw ApiException(status, "Server sent no token.")
        return token
    }

    /** Long-poll. Returns the raw JSON body for [CommandParser]. */
    fun poll(waitSeconds: Int): String {
        val (status, text) = request("GET", "/api/device/commands?wait=$waitSeconds", null, readTimeoutMs = (waitSeconds + 10) * 1000)
        if (status == 401) throw UnauthorizedException()
        if (status != 200) throw ApiException(status, "Poll answered $status.")
        return text
    }

    fun report(callId: String, state: String, reason: String? = null) {
        val body = JSONObject().put("state", state)
        if (reason != null) body.put("reason", reason)
        val (status, _) = request("POST", "/api/device/calls/$callId/status", body.toString(), readTimeoutMs = 10_000)
        if (status == 401) throw UnauthorizedException()
        // 404/409 mean the server already moved on (e.g. the call expired); nothing to do.
    }

    fun unpair() {
        request("DELETE", "/api/device", null, readTimeoutMs = 10_000)
    }

    /** Abort a poll that is blocked on the network, used when the service stops. */
    fun cancel() {
        active?.disconnect()
    }

    private fun request(method: String, path: String, body: String?, readTimeoutMs: Int): Pair<Int, String> {
        val conn = URL(baseUrl + path).openConnection() as HttpURLConnection
        active = conn
        try {
            conn.requestMethod = method
            conn.connectTimeout = 10_000
            conn.readTimeout = readTimeoutMs
            conn.instanceFollowRedirects = false
            conn.setRequestProperty("Accept", "application/json")
            if (token != null) conn.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val status = conn.responseCode
            val stream = if (status >= 400) conn.errorStream else conn.inputStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText().take(64 * 1024) } ?: ""
            return status to text
        } finally {
            conn.disconnect()
            if (active === conn) active = null
        }
    }
}
