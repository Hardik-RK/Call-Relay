package dev.quickdial

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.ServiceCompat
import java.io.IOException

/**
 * Foreground service that long-polls the server for dial commands.
 *
 * Each poll is one HTTP request the server holds open for up to 25 seconds. A queued call wakes it
 * at once, so a call usually reaches the phone within a second or two, with no push provider.
 * Network errors back off exponentially up to 30 seconds. A 401 means the phone was unpaired from
 * the web page, so the service clears its pairing and stops.
 *
 * A received command is never dialled automatically. It becomes a prompt: in-app when the app is
 * on screen, otherwise a notification (see [Notifier.postDialRequest]).
 */
class PollService : Service() {
    @Volatile private var running = false
    private var worker: Thread? = null
    @Volatile private var api: Api? = null
    private val handled = LinkedHashSet<String>()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val settings = Settings(this)
        val url = settings.serverUrl
        val token = settings.token
        if (url == null || token == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        Notifier.ensureChannels(this)
        try {
            val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
            ServiceCompat.startForeground(this, Notifier.ONGOING_ID, Notifier.ongoing(this, "Connecting"), type)
        } catch (e: Exception) {
            // Android refuses to start a foreground service from the background in some cases
            // (for example a restart after the process was killed). Nothing useful to do but stop.
            Log.w(TAG, "Could not enter foreground: ${e.javaClass.simpleName}")
            AppState.status.value = "Stopped: Android would not let the service start. Open the app."
            stopSelf()
            return START_NOT_STICKY
        }
        if (worker?.isAlive != true) {
            running = true
            val client = Api(url, token)
            api = client
            worker = Thread({ pollLoop(client, settings) }, "quick-dial-poll").also { it.start() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        api?.cancel()
        worker?.interrupt()
        if (Settings(this).listening) AppState.status.value = "Not listening"
        super.onDestroy()
    }

    private fun setStatus(text: String) {
        if (AppState.status.value == text) return
        AppState.status.value = text
        Notifier.updateOngoing(this, text)
    }

    private fun pollLoop(client: Api, settings: Settings) {
        var backoffMs = 1_000L
        while (running) {
            try {
                val body = client.poll(25)
                setStatus("Connected, waiting for calls")
                backoffMs = 1_000L
                val parsed = CommandParser.parse(body)
                parsed.rejected.forEach { r ->
                    r.id?.let { Reporter.report(this, it, "failed", r.reason) }
                }
                parsed.valid.forEach(::handle)
            } catch (_: UnauthorizedException) {
                settings.clearPairing()
                setStatus("Unpaired by the server")
                running = false
                stopSelf()
            } catch (e: IOException) {
                if (!running) break
                setStatus("Server unreachable, retrying")
                Log.w(TAG, "poll failed: ${e.javaClass.simpleName}")
                try {
                    Thread.sleep(backoffMs)
                } catch (_: InterruptedException) {
                    break
                }
                backoffMs = (backoffMs * 2).coerceAtMost(30_000L)
            }
        }
    }

    private fun handle(command: DialCommand) {
        synchronized(handled) {
            if (!handled.add(command.id)) return
            if (handled.size > 200) handled.remove(handled.first())
        }
        if (AppState.activityVisible) AppState.offer(command) else Notifier.postDialRequest(this, command)
    }

    companion object {
        private const val TAG = "QuickDial"

        fun start(context: Context) {
            context.startForegroundService(Intent(context, PollService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, PollService::class.java))
        }
    }
}
