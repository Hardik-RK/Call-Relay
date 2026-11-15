package dev.quickdial

import org.json.JSONException
import org.json.JSONObject

data class DialCommand(val id: String, val number: String)

data class RejectedCommand(val id: String?, val reason: String)

data class ParsedCommands(val valid: List<DialCommand>, val rejected: List<RejectedCommand>)

/**
 * Parses the body of GET /api/device/commands:
 *   {"commands":[{"id":"<uuid>","type":"dial","number":"+919123456789","createdAt":1}]}
 *
 * The phone does not trust the server blindly. A command is only accepted when it is a "dial" with
 * a uuid-shaped id and a strict E.164 number. Anything else is rejected with a reason so the
 * caller can report a failure instead of silently dropping it. Unknown command types are ignored
 * (forward compatibility), and a malformed body yields an empty result rather than a crash.
 */
object CommandParser {
    private val ID = Regex("^[0-9a-fA-F-]{36}$")

    fun parse(body: String): ParsedCommands {
        val valid = ArrayList<DialCommand>()
        val rejected = ArrayList<RejectedCommand>()
        val array = try {
            JSONObject(body).optJSONArray("commands")
        } catch (_: JSONException) {
            null
        } ?: return ParsedCommands(valid, rejected)

        val seen = HashSet<String>()
        for (i in 0 until array.length()) {
            val item = array.optJSONObject(i) ?: continue
            if (item.optString("type") != "dial") continue
            val id = item.optString("id", "")
            if (!ID.matches(id)) {
                rejected.add(RejectedCommand(null, "bad command id"))
                continue
            }
            val number = item.optString("number", "")
            if (!PhoneNumbers.isE164(number)) {
                rejected.add(RejectedCommand(id, "invalid number"))
                continue
            }
            if (seen.add(id)) valid.add(DialCommand(id, number))
        }
        return ParsedCommands(valid, rejected)
    }
}
