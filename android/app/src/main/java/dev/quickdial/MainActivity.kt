package dev.quickdial

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings as AndroidSettings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import dev.quickdial.ui.ConfirmCallDialog
import dev.quickdial.ui.HomeScreen
import dev.quickdial.ui.PAIRING_CODE_LENGTH
import dev.quickdial.ui.PairScreen
import dev.quickdial.ui.Qd
import dev.quickdial.ui.QdToastHost
import dev.quickdial.ui.QuickDialTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private lateinit var settings: Settings
    private var pendingCall: Pair<String?, String>? = null

    private val callPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        pendingCall?.let { (id, number) -> launchDialer(id, number, useCall = granted) }
        pendingCall = null
    }

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {}

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        settings = Settings(this)
        // Lets the "Call?" prompt show over the lock screen when it arrives as a full-screen intent.
        setShowWhenLocked(true)
        setTurnScreenOn(true)

        enableEdgeToEdge()
        setContent {
            QuickDialTheme { App() }
        }
        if (savedInstanceState == null) handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onStart() {
        super.onStart()
        AppState.activityVisible = true
    }

    override fun onStop() {
        AppState.activityVisible = false
        super.onStop()
    }

    // ---- notification entry points ----------------------------------------------------------

    private fun handleIntent(intent: Intent?) {
        val id = intent?.getStringExtra(Notifier.EXTRA_ID) ?: return
        val number = intent.getStringExtra(Notifier.EXTRA_NUMBER) ?: return
        // These extras came from our own PendingIntent, but treat them like any other input.
        val raw = intent.getBooleanExtra(Notifier.EXTRA_RAW, false)
        if (!(if (raw) PhoneNumbers.isDialString(number) else PhoneNumbers.isE164(number))) return
        when (intent.action) {
            Notifier.ACTION_CONFIRM -> {
                Notifier.cancelRequest(this, id)
                AppState.resolve(id)
                startCall(id, number)
            }
            Notifier.ACTION_REVIEW -> {
                Notifier.cancelRequest(this, id)
                AppState.offer(DialCommand(id, number, raw))
            }
        }
        // Do not replay this intent after a rotation or when the activity is recreated.
        setIntent(Intent())
    }

    // ---- placing a call ----------------------------------------------------------------------

    /** ACTION_CALL when we hold CALL_PHONE, otherwise ACTION_DIAL (the user presses the green button). */
    fun startCall(callId: String?, number: String) {
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
        when {
            granted -> launchDialer(callId, number, useCall = true)
            !settings.callPermissionAsked -> {
                settings.callPermissionAsked = true
                pendingCall = callId to number
                callPermission.launch(Manifest.permission.CALL_PHONE)
            }
            else -> launchDialer(callId, number, useCall = false)
        }
    }

    private fun launchDialer(callId: String?, number: String, useCall: Boolean) {
        val action = if (useCall) Intent.ACTION_CALL else Intent.ACTION_DIAL
        try {
            startActivity(Intent(action, Uri.fromParts("tel", number, null)))
            callId?.let { Reporter.report(this, it, "dialing") }
        } catch (e: SecurityException) {
            if (useCall) launchDialer(callId, number, useCall = false) else fail(callId, "not allowed to open the dialer")
        } catch (e: ActivityNotFoundException) {
            fail(callId, "no dialer app on this phone")
        }
    }

    private fun fail(callId: String?, reason: String) {
        Toast.makeText(this, "Could not start the call: $reason", Toast.LENGTH_LONG).show()
        callId?.let { Reporter.report(this, it, "failed", reason) }
    }

    // ---- UI ----------------------------------------------------------------------------------

    @Composable
    private fun App() {
        var paired by remember { mutableStateOf(settings.isPaired) }
        val status by AppState.status.collectAsState()
        // The service clears pairing itself when the server revokes this phone.
        LaunchedEffect(status) { paired = settings.isPaired }

        val prompts by AppState.prompts.collectAsState()
        val toasts = remember { SnackbarHostState() }
        Box(Modifier.fillMaxSize().background(Qd.colors.base)) {
            Column(
                Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            ) {
                if (paired) HomeContent(status, toasts, onUnpaired = { paired = false })
                else PairContent(onPaired = { paired = true })
            }
            QdToastHost(toasts, Modifier.align(Alignment.BottomCenter).windowInsetsPadding(WindowInsets.safeDrawing))
        }
        prompts.firstOrNull()?.let { cmd ->
            ConfirmCallDialog(
                number = cmd.number,
                exact = cmd.raw,
                onCall = {
                    AppState.resolve(cmd.id)
                    startCall(cmd.id, cmd.number)
                },
                onDecline = {
                    AppState.resolve(cmd.id)
                    Reporter.report(this, cmd.id, "failed", "declined on phone")
                },
            )
        }
    }

    @Composable
    private fun PairContent(onPaired: () -> Unit) {
        var url by rememberSaveable { mutableStateOf("") }
        var code by rememberSaveable { mutableStateOf("") }
        var error by remember { mutableStateOf<String?>(null) }
        var busy by remember { mutableStateOf(false) }
        val scope = rememberCoroutineScope()

        PairScreen(
            url = url, code = code, error = error, busy = busy,
            onUrl = { url = it; error = null },
            onCode = { code = it; error = null },
            onPair = {
                val base = ServerUrl.normalize(url)
                if (base == null) {
                    error = "That does not look like a server address."
                    return@PairScreen
                }
                busy = true
                error = null
                scope.launch {
                    val sent = if (code.length == PAIRING_CODE_LENGTH) code.take(4) + "-" + code.drop(4) else code
                    val result = withContext(Dispatchers.IO) { runCatching { Api(base).pair(sent) } }
                    busy = false
                    result.onSuccess { token ->
                        settings.serverUrl = base
                        settings.token = token
                        settings.listening = true
                        askNotificationPermission()
                        PollService.start(this@MainActivity)
                        onPaired()
                    }.onFailure { e ->
                        error = if (e is ApiException) e.message else "Could not reach the server. Check the address and that both devices are on the same network."
                    }
                }
            },
        )
    }

    @Composable
    private fun HomeContent(status: String, toasts: SnackbarHostState, onUnpaired: () -> Unit) {
        var listening by remember { mutableStateOf(settings.listening) }
        var country by remember { mutableStateOf(settings.country) }
        var number by rememberSaveable { mutableStateOf("") }
        var anyInput by rememberSaveable { mutableStateOf(false) }
        val scope = rememberCoroutineScope()

        // Resume listening when the app is reopened (the service does not survive a reboot).
        LaunchedEffect(Unit) { if (settings.listening) PollService.start(this@MainActivity) }

        HomeScreen(
            status = status,
            serverUrl = settings.serverUrl.orEmpty(),
            listening = listening,
            country = country,
            exactMode = anyInput,
            number = number,
            onListening = { on ->
                listening = on
                settings.listening = on
                if (on) {
                    askNotificationPermission()
                    PollService.start(this@MainActivity)
                } else {
                    PollService.stop(this@MainActivity)
                    AppState.status.value = "Not listening"
                }
            },
            onCountry = { country = it; settings.country = it },
            onExactMode = { anyInput = it },
            onNumber = { number = it },
            onPaste = {
                val clip = getSystemService(ClipboardManager::class.java).primaryClip
                val text = clip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString().orEmpty()
                val kept = text.filter { it.isDigit() || it in "+*#-(). " }.trim().take(PhoneNumbers.MAX_DIAL_STRING)
                if (kept.isEmpty()) scope.launch { toasts.showSnackbar("Nothing to paste.") } else number = kept
            },
            onCall = { startCall(null, it) },
            onBattery = { open(Intent(AndroidSettings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), toasts, scope) },
            onFullScreen = if (Build.VERSION.SDK_INT >= 34) {
                {
                    open(
                        Intent(AndroidSettings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName")),
                        toasts, scope,
                    )
                }
            } else null,
            onUnpair = {
                scope.launch {
                    val url = settings.serverUrl
                    val token = settings.token
                    PollService.stop(this@MainActivity)
                    if (url != null && token != null) {
                        withContext(Dispatchers.IO) { runCatching { Api(url, token).unpair() } }
                    }
                    settings.clearPairing()
                    AppState.status.value = "Not listening"
                    onUnpaired()
                }
            },
        )
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun open(intent: Intent, toasts: SnackbarHostState, scope: CoroutineScope) {
        try {
            startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            scope.launch { toasts.showSnackbar("This setting is not available on this phone.") }
        }
    }
}
