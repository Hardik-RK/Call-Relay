package dev.quickdial

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ServerUrlTest {
    @Test
    fun addsHttpWhenSchemeIsMissing() {
        assertEquals("http://192.168.1.20:8787", ServerUrl.normalize("192.168.1.20:8787"))
        assertEquals("http://10.0.2.2:8787", ServerUrl.normalize(" 10.0.2.2:8787 "))
    }

    @Test
    fun keepsSchemeAndTrimsTrailingSlash() {
        assertEquals("https://dial.example.net", ServerUrl.normalize("https://dial.example.net/"))
        assertEquals("http://box.tailnet.example:8787", ServerUrl.normalize("HTTP://box.tailnet.example:8787/"))
        assertEquals("https://example.net/dial", ServerUrl.normalize("https://example.net/dial/"))
    }

    @Test
    fun refusesOtherSchemesAndOddInput() {
        assertNull(ServerUrl.normalize(""))
        assertNull(ServerUrl.normalize("   "))
        assertNull(ServerUrl.normalize("ftp://example.net"))
        assertNull(ServerUrl.normalize("file:///etc/passwd"))
        assertNull(ServerUrl.normalize("javascript://example.net"))
        assertNull(ServerUrl.normalize("http://"))
        assertNull(ServerUrl.normalize("not a url"))
    }

    @Test
    fun refusesCredentialsQueriesAndFragments() {
        assertNull(ServerUrl.normalize("http://user:pass@example.net"))
        assertNull(ServerUrl.normalize("http://example.net/?a=b"))
        assertNull(ServerUrl.normalize("http://example.net/#x"))
    }
}
