package dev.quickdial

import java.net.URI

/** Cleans up what a person types into the "server address" field. */
object ServerUrl {
    /**
     * Returns a base URL without a trailing slash, or null when the input cannot be a server.
     * A missing scheme is assumed to be http, because the usual targets are a LAN or private
     * network address. Credentials, queries and fragments are refused rather than stripped.
     */
    fun normalize(input: String): String? {
        var text = input.trim()
        if (text.isEmpty() || text.any { it.isWhitespace() }) return null
        if (!text.contains("://")) text = "http://$text"
        val uri = try {
            URI(text)
        } catch (_: Exception) {
            return null
        }
        val scheme = uri.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") return null
        if (uri.host.isNullOrEmpty()) return null
        if (uri.userInfo != null || uri.query != null || uri.fragment != null) return null
        val port = if (uri.port == -1) "" else ":${uri.port}"
        val path = uri.path.orEmpty().trimEnd('/')
        return "$scheme://${uri.host}$port$path"
    }
}
