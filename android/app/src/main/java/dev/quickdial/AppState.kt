package dev.quickdial

import android.content.Context
import android.util.Log
import java.util.concurrent.Executors
import kotlinx.coroutines.flow.MutableStateFlow

/** Process-wide state shared between the poll service and the UI. */
object AppState {
    val status = MutableStateFlow("Not listening")

    /** Dial requests waiting for a yes/no from the user, oldest first. */
    val prompts = MutableStateFlow<List<DialCommand>>(emptyList())

    /** True while MainActivity is on screen; decides between an in-app prompt and a notification. */
    @Volatile var activityVisible = false

    fun offer(command: DialCommand) {
        prompts.value = prompts.value.filter { it.id != command.id } + command
    }

    fun resolve(id: String) {
        prompts.value = prompts.value.filter { it.id != id }
    }
}

/** Sends progress back to the server without blocking the UI thread. Failures are only logged. */
object Reporter {
    private val executor = Executors.newSingleThreadExecutor()

    fun report(context: Context, callId: String, state: String, reason: String? = null) {
        val settings = Settings(context)
        val url = settings.serverUrl ?: return
        val token = settings.token ?: return
        executor.execute {
            try {
                Api(url, token).report(callId, state, reason)
            } catch (e: Exception) {
                Log.w("QuickDial", "Could not report $state for a call: ${e.javaClass.simpleName}")
            }
        }
    }
}
