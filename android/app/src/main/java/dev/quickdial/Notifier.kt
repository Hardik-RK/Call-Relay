package dev.quickdial

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object Notifier {
    const val ONGOING_ID = 1
    private const val CHANNEL_ONGOING = "listening"
    private const val CHANNEL_REQUESTS = "dial_requests"

    const val ACTION_REVIEW = "dev.quickdial.REVIEW"
    const val ACTION_CONFIRM = "dev.quickdial.CONFIRM"
    const val ACTION_DECLINE = "dev.quickdial.DECLINE"
    const val EXTRA_ID = "call_id"
    const val EXTRA_NUMBER = "number"

    fun ensureChannels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ONGOING, "Listening for calls", NotificationManager.IMPORTANCE_LOW),
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_REQUESTS, "Call requests", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Asks you to confirm a number sent from the web page"
            },
        )
    }

    fun ongoing(context: Context, text: String): Notification {
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(context, CHANNEL_ONGOING)
            .setSmallIcon(R.drawable.ic_call)
            .setContentTitle("Quick Dial")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    fun updateOngoing(context: Context, text: String) {
        if (!canNotify(context)) return
        safeNotify(context, ONGOING_ID, ongoing(context, text))
    }

    /**
     * Posts the "Call this number?" prompt.
     *
     * Three ways to act on it, all of which are direct user taps (Android only lets an app start an
     * activity from a notification when the tap targets the activity itself, not a trampoline):
     *  - tap the notification: open the app on a confirm dialog
     *  - "Call": open the app and place the call straight away
     *  - "Decline": tell the server, start nothing
     * The full-screen intent is a best effort for a locked or idle screen; the system may turn it
     * into a plain heads-up notification, and that is fine.
     */
    fun postDialRequest(context: Context, command: DialCommand) {
        if (!canNotify(context)) return
        val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        val base = command.id.hashCode()

        fun activityIntent(action: String) = Intent(context, MainActivity::class.java).apply {
            this.action = action
            putExtra(EXTRA_ID, command.id)
            putExtra(EXTRA_NUMBER, command.number)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }

        val review = PendingIntent.getActivity(context, base, activityIntent(ACTION_REVIEW), flags)
        val confirm = PendingIntent.getActivity(context, base + 1, activityIntent(ACTION_CONFIRM), flags)
        val decline = PendingIntent.getBroadcast(
            context, base + 2,
            Intent(context, DeclineReceiver::class.java).apply {
                action = ACTION_DECLINE
                putExtra(EXTRA_ID, command.id)
            },
            flags,
        )

        val publicVersion = NotificationCompat.Builder(context, CHANNEL_REQUESTS)
            .setSmallIcon(R.drawable.ic_call)
            .setContentTitle("Call request")
            .setContentText("Unlock to see the number")
            .build()

        val notification = NotificationCompat.Builder(context, CHANNEL_REQUESTS)
            .setSmallIcon(R.drawable.ic_call)
            .setContentTitle("Call ${command.number}?")
            .setContentText("Sent from the web page")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion)
            .setContentIntent(review)
            .setFullScreenIntent(review, true)
            .addAction(0, "Call", confirm)
            .addAction(0, "Decline", decline)
            .setAutoCancel(true)
            .setTimeoutAfter(2 * 60 * 1000L)
            .build()
        safeNotify(context, base, notification)
    }

    fun cancelRequest(context: Context, callId: String) {
        NotificationManagerCompat.from(context).cancel(callId.hashCode())
    }

    @android.annotation.SuppressLint("MissingPermission")
    private fun safeNotify(context: Context, id: Int, notification: Notification) {
        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (_: SecurityException) {
            // POST_NOTIFICATIONS was revoked between the check and the call; nothing to show.
        }
    }

    private fun canNotify(context: Context): Boolean = NotificationManagerCompat.from(context).areNotificationsEnabled()
}

class DeclineReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(Notifier.EXTRA_ID) ?: return
        Notifier.cancelRequest(context, id)
        AppState.resolve(id)
        Reporter.report(context, id, "failed", "declined on phone")
    }
}
