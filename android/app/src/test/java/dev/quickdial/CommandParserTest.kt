package dev.quickdial

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CommandParserTest {
    private val N = TestNumbers.mobile()
    private val id1 = "11111111-1111-4111-8111-111111111111"
    private val id2 = "22222222-2222-4222-8222-222222222222"

    private fun body(vararg commands: String) = """{"commands":[${commands.joinToString(",")}]}"""
    private fun dial(id: String, number: String) = """{"id":"$id","type":"dial","number":"$number","createdAt":1}"""

    @Test
    fun parsesValidCommands() {
        val r = CommandParser.parse(body(dial(id1, "+91$N"), dial(id2, "+12025550143")))
        assertEquals(listOf(DialCommand(id1, "+91$N"), DialCommand(id2, "+12025550143")), r.valid)
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
                dial(id1, "$N"),
                dial(id2, "+91 ${TestNumbers.group(N)}"),
                dial("33333333-3333-4333-8333-333333333333", "tel:+91$N"),
            ),
        )
        assertTrue(r.valid.isEmpty())
        assertEquals(3, r.rejected.size)
        assertEquals(id1, r.rejected[0].id)
        assertEquals("invalid number", r.rejected[0].reason)
    }

    @Test
    fun rejectsBadIdsWithoutReportingThemBack() {
        val r = CommandParser.parse(body(dial("not-a-uuid", "+91$N"), dial("", "+91$N")))
        assertTrue(r.valid.isEmpty())
        assertEquals(listOf(null, null), r.rejected.map { it.id })
    }

    @Test
    fun ignoresUnknownTypes() {
        val r = CommandParser.parse(body("""{"id":"$id1","type":"wipe","number":"+91$N"}""", dial(id2, "+91$N")))
        assertEquals(listOf(DialCommand(id2, "+91$N")), r.valid)
        assertTrue(r.rejected.isEmpty())
    }

    @Test
    fun dropsDuplicateIdsWithinOneBatch() {
        val r = CommandParser.parse(body(dial(id1, "+91$N"), dial(id1, "+91$N")))
        assertEquals(1, r.valid.size)
    }

    @Test
    fun numberMustBeAString() {
        val r = CommandParser.parse(body("""{"id":"$id1","type":"dial","number":91$N}"""))
        assertTrue(r.valid.isEmpty())
    }

    @Test
    fun rawCommandsCarryTheirFlagAndAreVettedAsDialStrings() {
        val raw = """{"id":"$id1","type":"dial","number":"*#06#","raw":true,"createdAt":1}"""
        val notRaw = """{"id":"$id2","type":"dial","number":"*#06#","createdAt":1}"""
        val tooLong = """{"id":"33333333-3333-4333-8333-333333333333","type":"dial","number":"${"9".repeat(40)}","raw":true}"""
        val r = CommandParser.parse(body(raw, notRaw, tooLong))
        assertEquals(listOf(DialCommand(id1, "*#06#", true)), r.valid)
        assertEquals(2, r.rejected.size)
    }
}
