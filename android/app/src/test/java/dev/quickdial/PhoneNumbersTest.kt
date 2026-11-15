package dev.quickdial

import java.io.File
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneNumbersTest {
    // Same table the server tests use, so the two implementations cannot drift apart.
    private val cases: JSONArray = JSONArray(File("../../shared/phone-cases.json").readText())

    @Test
    fun sharedTableIsLoaded() {
        assertTrue("expected the shared table to have 60+ cases, got ${cases.length()}", cases.length() >= 60)
    }

    @Test
    fun matchesSharedTable() {
        val failures = ArrayList<String>()
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val input = c.getString("input")
            val country = Country.fromCode(c.getString("country"))!!
            val actual = PhoneNumbers.normalize(input, country)
            if (c.has("e164")) {
                val expected = PhoneResult.Ok(c.getString("e164"))
                if (actual != expected) failures.add("$country '$input': expected $expected, got $actual")
            } else {
                val expected = PhoneResult.Failed(PhoneFailure.valueOf(c.getString("error").uppercase()))
                if (actual != expected) failures.add("$country '$input': expected $expected, got $actual")
            }
        }
        assertTrue(failures.joinToString("\n"), failures.isEmpty())
    }

    @Test
    fun indianNumberShapes() {
        val expected = PhoneResult.Ok("+919123456789")
        for (s in listOf("9123456789", "09123456789", "+91 91234 56789", "91-91234-56789", "919123456789", "0091 91234 56789")) {
            assertEquals(s, expected, PhoneNumbers.normalize(s, Country.IN))
        }
    }

    @Test
    fun e164Check() {
        assertTrue(PhoneNumbers.isE164("+919123456789"))
        assertFalse(PhoneNumbers.isE164("919123456789"))
        assertFalse(PhoneNumbers.isE164("+0919123456789"))
        assertFalse(PhoneNumbers.isE164("+91 9123456789"))
        assertFalse(PhoneNumbers.isE164("+1234567"))
        assertFalse(PhoneNumbers.isE164("+1234567890123456"))
        assertFalse(PhoneNumbers.isE164("tel:+919123456789"))
        assertFalse(PhoneNumbers.isE164("+91912345678\n"))
    }

    @Test
    fun maskKeepsLastFourDigits() {
        assertEquals("*********6789", PhoneNumbers.mask("+919123456789"))
        assertEquals("123", PhoneNumbers.mask("123"))
    }
}
