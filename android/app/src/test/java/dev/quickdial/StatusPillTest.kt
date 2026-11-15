package dev.quickdial

import dev.quickdial.ui.Tone
import dev.quickdial.ui.statusPill
import org.junit.Assert.assertEquals
import org.junit.Test

class StatusPillTest {
    @Test fun connectedShowsListening() = assertEquals("Listening" to Tone.Success, statusPill("Connected, waiting for calls"))
    @Test fun offIsNeutral() = assertEquals("Not listening" to Tone.Neutral, statusPill("Not listening"))
    @Test fun unreachableWarns() = assertEquals("Retrying" to Tone.Warning, statusPill("Server unreachable, retrying"))
    @Test fun revokedAndStoppedAreErrors() {
        assertEquals(Tone.Danger, statusPill("Unpaired by the server").second)
        assertEquals(Tone.Danger, statusPill("Stopped: Android would not let the service start. Open the app.").second)
    }
    @Test fun anythingElseIsConnecting() = assertEquals("Connecting" to Tone.Accent, statusPill("Starting"))
}
