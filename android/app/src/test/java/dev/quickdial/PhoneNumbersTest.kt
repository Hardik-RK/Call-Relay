package dev.quickdial

import java.io.File
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneNumbersTest {
    private val N = TestNumbers.mobile()
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
        val expected = PhoneResult.Ok("+91$N")
        for (s in listOf("$N", "0$N", "+91 ${TestNumbers.group(N)}", "91-${N.take(5)}-${N.drop(5)}", "91$N", "0091 ${TestNumbers.group(N)}")) {
            assertEquals(s, expected, PhoneNumbers.normalize(s, Country.IN))
        }
    }

    @Test
    fun e164Check() {
        assertTrue(PhoneNumbers.isE164("+91$N"))
        assertFalse(PhoneNumbers.isE164("91$N"))
        assertFalse(PhoneNumbers.isE164("+091$N"))
        assertFalse(PhoneNumbers.isE164("+91 $N"))
        assertFalse(PhoneNumbers.isE164("+1234567"))
        assertFalse(PhoneNumbers.isE164("+1234567890123456"))
        assertFalse(PhoneNumbers.isE164("tel:+91$N"))
        assertFalse(PhoneNumbers.isE164("+91${N.take(9)}\n"))
    }

    @Test
    fun maskKeepsLastFourDigits() {
        assertEquals("*********${N.takeLast(4)}", PhoneNumbers.mask("+91$N"))
        assertEquals("123", PhoneNumbers.mask("123"))
    }

    @Test
    fun anyInputAcceptsShortCodesAndPausesAsTyped() {
        for (text in listOf("112", "*#06#", "*21*$N#", "1800 123 456,,1", "+91$N;123", "ABC-DEF", "  112  ")) {
            assertTrue(text, PhoneNumbers.isDialString(text))
        }
    }

    @Test
    fun anyInputRefusesEmptyOversizedAndControlCharacters() {
        assertFalse(PhoneNumbers.isDialString("   "))
        assertFalse(PhoneNumbers.isDialString("7".repeat(PhoneNumbers.MAX_DIAL_STRING + 1)))
        assertTrue(PhoneNumbers.isDialString("7".repeat(PhoneNumbers.MAX_DIAL_STRING)))
        for (bad in listOf("1\u00002", "1\n2", "1\t2", "1\u200b2", "1\u202e2", "1\u00a02", "1\u20282")) {
            assertFalse(bad, PhoneNumbers.isDialString(bad))
        }
    }

    @Test
    fun randomIndianNumbersNormaliseInManyWrittenForms() {
        repeat(200) {
            val n = TestNumbers.mobile()
            val expected = PhoneResult.Ok("+91$n")
            for (s in listOf(n, TestNumbers.group(n), "0$n", "+91 ${TestNumbers.group(n)}", "91$n", "0091$n", "  $n  ")) {
                assertEquals(s, expected, PhoneNumbers.normalize(s, Country.IN))
            }
        }
    }
}
