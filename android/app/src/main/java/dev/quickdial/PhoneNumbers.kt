package dev.quickdial

/**
 * Phone number normalisation to E.164. Behaviour must match server/src/phone.ts; both are checked
 * against the same table, shared/phone-cases.json.
 */
enum class Country(val code: String, val dial: String, val nationalLength: Int, val trunk: String?, val pattern: Regex) {
    IN("IN", "91", 10, "0", Regex("^[1-9][0-9]{9}$")),
    US("US", "1", 10, null, Regex("^[2-9][0-9]{2}[2-9][0-9]{6}$")),
    GB("GB", "44", 10, "0", Regex("^[1-9][0-9]{9}$")),
    AU("AU", "61", 9, "0", Regex("^[2-9][0-9]{8}$"));

    companion object {
        fun fromCode(code: String): Country? = entries.firstOrNull { it.code == code }
    }
}

enum class PhoneFailure { EMPTY, INVALID_CHARACTERS, TOO_SHORT, TOO_LONG, INVALID_FOR_COUNTRY }

sealed interface PhoneResult {
    data class Ok(val e164: String) : PhoneResult
    data class Failed(val reason: PhoneFailure) : PhoneResult
}

object PhoneNumbers {
    private const val MIN_DIGITS = 8
    private const val MAX_DIGITS = 15
    private val ALLOWED = Regex("^\\+?[0-9\\s\\-.()]+$")
    private val E164 = Regex("^\\+[1-9][0-9]{7,14}$")

    /** True for a string that is already strict E.164. Used to vet commands from the server. */
    fun isE164(value: String): Boolean = E164.matches(value)

    /** Mask all but the last four digits, for places where a number should not be fully on show. */
    fun mask(e164: String): String =
        if (e164.length <= 4) e164 else "*".repeat(e164.length - 4) + e164.takeLast(4)

    fun normalize(input: String, default: Country): PhoneResult {
        val text = input.trim()
        if (text.isEmpty()) return fail(PhoneFailure.EMPTY)
        if (text.length > 40 || !ALLOWED.matches(text)) return fail(PhoneFailure.INVALID_CHARACTERS)
        val digits = text.filter { it in '0'..'9' }
        if (digits.isEmpty()) return fail(PhoneFailure.INVALID_CHARACTERS)

        if (text.startsWith("+")) return finish(digits)
        if (digits.startsWith("00")) return finish(digits.substring(2))

        val withCountry = default.dial.length + default.nationalLength
        if (digits.startsWith(default.dial) && digits.length == withCountry) return finish(digits)
        val trunk = default.trunk
        if (trunk != null && digits.startsWith(trunk + default.dial) && digits.length == withCountry + 1) {
            return finish(digits.substring(1))
        }

        var national = digits
        if (trunk != null && national.startsWith(trunk)) national = national.substring(1)
        if (national.length < default.nationalLength) return fail(PhoneFailure.TOO_SHORT)
        if (national.length > default.nationalLength) return fail(PhoneFailure.TOO_LONG)
        return finish(default.dial + national)
    }

    private fun fail(reason: PhoneFailure): PhoneResult = PhoneResult.Failed(reason)

    private fun countryFor(intl: String): Country? = Country.entries.firstOrNull { intl.startsWith(it.dial) }

    private fun finish(intl: String): PhoneResult {
        if (intl.length < MIN_DIGITS) return fail(PhoneFailure.TOO_SHORT)
        if (intl.startsWith("0")) return fail(PhoneFailure.INVALID_FOR_COUNTRY)

        val country = countryFor(intl)
        if (country == null) {
            return if (intl.length > MAX_DIGITS) fail(PhoneFailure.TOO_LONG) else PhoneResult.Ok("+$intl")
        }
        var national = intl.substring(country.dial.length)
        val trunk = country.trunk
        if (trunk != null && national.startsWith(trunk) && national.length == country.nationalLength + 1) {
            national = national.substring(1)
        }
        if (national.length < country.nationalLength) return fail(PhoneFailure.TOO_SHORT)
        if (national.length > country.nationalLength) return fail(PhoneFailure.TOO_LONG)
        if (!country.pattern.matches(national)) return fail(PhoneFailure.INVALID_FOR_COUNTRY)
        return PhoneResult.Ok("+" + country.dial + national)
    }
}
