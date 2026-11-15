package dev.quickdial

import kotlin.random.Random

/** Random numbers for tests: no fixed number is baked into the test code. */
object TestNumbers {
    /** A 10-digit Indian mobile number (first digit 6 to 9). */
    fun mobile(random: Random = Random.Default): String =
        (6 + random.nextInt(4)).toString() + (1..9).joinToString("") { random.nextInt(10).toString() }

    fun group(n: String): String = n.take(5) + " " + n.drop(5)
}
