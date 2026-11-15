package dev.quickdial

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CommandParserTest {
    private val id1 = "11111111-1111-4111-8111-111111111111"
    private val id2 = "22222222-2222-4222-8222-222222222222"

    private fun body(vararg commands: String) = """{"commands":[${commands.joinToString(",")}]}"""
    private fun dial(id: String, number: String) = """{"id":"$id","type":"dial","number":"$number","createdAt":1}"""

    @Test
    fun parsesValidCommands() {
        val r = CommandParser.parse(body(dial(id1, "+919123456789"), dial(id2, "+12025550143")))
        assertEquals(listOf(DialCommand(id1, "+919123456789"), DialCommand(id2, "+12025550143")), r.valid)
        assertTrue(r.rejected.isEmpty())
    }

    @Test
    fun emptyAndMissingListsAreFine() {
        assertTrue(CommandParser.parse("""{"commands":[]}""").valid.isEmpty())
        assertTrue(CommandParser.parse("""{}""").valid.isEmpty())
    }

    @Test
    fun garbageBodiesDoNotCrash() {
        for (s in listOf("", "not json", "[]", "null", """{"commands":"x"}""", """{"commands":[1,"a",null]}""")) {
            val r = CommandParser.parse(s)
            assertTrue(s, r.valid.isEmpty())
        }
    }

    @Test
    fun rejectsNonE164Numbers() {
        val r = CommandParser.parse(
            body(
                dial(id1, "9123456789"),
                dial(id2, "+91 91234 56789"),
                dial("33333333-3333-4333-8333-333333333333", "tel:+919123456789"),
            ),
        )
        assertTrue(r.valid.isEmpty())
        assertEquals(3, r.rejected.size)
        assertEquals(id1, r.rejected[0].id)
        assertEquals("invalid number", r.rejected[0].reason)
    }

    @Test
    fun rejectsBadIdsWithoutReportingThemBack() {
        val r = CommandParser.parse(body(dial("not-a-uuid", "+919123456789"), dial("", "+919123456789")))
        assertTrue(r.valid.isEmpty())
        assertEquals(listOf(null, null), r.rejected.map { it.id })
    }

    @Test
    fun ignoresUnknownTypes() {
        val r = CommandParser.parse(body("""{"id":"$id1","type":"wipe","number":"+919123456789"}""", dial(id2, "+919123456789")))
        assertEquals(listOf(DialCommand(id2, "+919123456789")), r.valid)
        assertTrue(r.rejected.isEmpty())
    }

    @Test
    fun dropsDuplicateIdsWithinOneBatch() {
        val r = CommandParser.parse(body(dial(id1, "+919123456789"), dial(id1, "+919123456789")))
        assertEquals(1, r.valid.size)
    }

    @Test
    fun numberMustBeAString() {
        val r = CommandParser.parse(body("""{"id":"$id1","type":"dial","number":919123456789}"""))
        assertTrue(r.valid.isEmpty())
    }
}
