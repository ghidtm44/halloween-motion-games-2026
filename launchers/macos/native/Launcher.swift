import Cocoa
import Darwin
import Security

private let motionGames = Bundle.main.object(forInfoDictionaryKey: "PlaygroundEdition") as? String == "motion"

// Only this native process reads the credential. The browser receives neither the
// Keychain item nor the server environment, and loading it never calls OpenAI.
private enum HostCredential {
    static let service = "com.local.simpleplayground.spooky-host"
    static let account = "api-key"
    static let maximumBytes = 4096

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    static func validated(_ value: String) throws -> String {
        let key = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty, key.utf8.count <= maximumBytes,
              key.utf8.allSatisfy({ $0 >= 33 && $0 <= 126 }) else {
            throw Failure(message: "Enter a nonempty API key without spaces, up to 4096 bytes.")
        }
        return key
    }

    private static func loginKeychain() throws -> SecKeychain {
        let path = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Keychains/login.keychain-db").path
        var keychain: SecKeychain?
        let status = path.withCString { SecKeychainOpen($0, &keychain) }
        guard status == errSecSuccess, let keychain = keychain else {
            throw Failure(message: "The login Keychain is unavailable (status \(status)).")
        }
        return keychain
    }

    private static func query(in keychain: SecKeychain) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account,
         kSecMatchSearchList as String: [keychain]]
    }

    static func load(allowAuthentication: Bool = false) throws -> String? {
        var attributes = query(in: try loginKeychain())
        attributes[kSecReturnData as String] = true
        attributes[kSecMatchLimit as String] = kSecMatchLimitOne
        // Launching the offline playground must never wait for a password prompt.
        attributes[kSecUseAuthenticationUI as String] = allowAuthentication ? kSecUseAuthenticationUIAllow : kSecUseAuthenticationUIFail
        var result: CFTypeRef?
        let status = SecItemCopyMatching(attributes as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            throw Failure(message: "The saved API key could not be read (Keychain status \(status)).")
        }
        return try validated(value)
    }

    static func save(_ value: String) throws {
        let key = try validated(value)
        let keychain = try loginKeychain()
        let attributes = query(in: keychain)
        let data = Data(key.utf8)
        var status = SecItemUpdate(attributes as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var addition = attributes
            addition.removeValue(forKey: kSecMatchSearchList as String)
            addition[kSecUseKeychain as String] = keychain
            addition[kSecValueData as String] = data
            addition[kSecAttrLabel as String] = "Simple Playground Spooky Host API key"
            // The traditional login Keychain is local to this Mac. No iCloud item.
            status = SecItemAdd(addition as CFDictionary, nil)
        }
        guard status == errSecSuccess else {
            throw Failure(message: "The API key was not saved (Keychain status \(status)).")
        }
    }

    // Invoke the installed, signed app executable so provisioning and normal
    // launches share its Keychain access identity. Never pass the key in argv.
    static func runCommand(_ arguments: [String]) -> Int32? {
        guard arguments.contains("--import-spooky-host-key-stdin") || arguments.contains("--check-spooky-host-key") else { return nil }
        do {
            guard arguments.count == 1 else { throw Failure(message: "Use one credential command with no additional arguments.") }
            if arguments[0] == "--check-spooky-host-key" {
                guard try load() != nil else { throw Failure(message: "No Spooky Host API key is saved in the login Keychain.") }
                print("Spooky Host API key is saved and readable. No API request was made.")
            } else {
                guard isatty(STDIN_FILENO) == 0 else { throw Failure(message: "Import requires piped standard input. Use the app's Save Spooky Host API Key menu for manual entry.") }
                var data = Data()
                while let chunk = try FileHandle.standardInput.read(upToCount: maximumBytes + 3 - data.count), !chunk.isEmpty {
                    data.append(chunk)
                    guard data.count <= maximumBytes + 2 else { throw Failure(message: "API key input is too large.") }
                }
                guard let value = String(data: data, encoding: .utf8) else { throw Failure(message: "API key input must be UTF-8 text.") }
                try save(value)
                print("Spooky Host API key saved in the login Keychain. Reopen Simple Playground to use it.")
            }
            return EXIT_SUCCESS
        } catch {
            let message = (error as? Failure)?.message ?? "The credential operation failed. No API key was printed."
            FileHandle.standardError.write(Data((message + "\n").utf8))
            return EXIT_FAILURE
        }
    }
}

final class PlaygroundDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private var status = NSTextField(labelWithString: "Starting Simple Playground…")
    private var detail = NSTextField(wrappingLabelWithString: "The local runtime is bundled. Camera access stays off until you choose Start camera.")
    private var controls: NSButton!
    private var player: NSButton!
    private var child: Process?
    private var input: Pipe?
    private var output: Pipe?
    private var outputBuffer = ""
    private var childReady = false
    private var logHandle: FileHandle?
    private var launching = false
    private var terminating = false
    private var ready = false
    private var credentialNotice: String?
    private var signalSources: [DispatchSourceSignal] = []
    private var signalTerminationRequested = false
    private let port = Int(ProcessInfo.processInfo.environment["SIMPLE_PLAYGROUND_TEST_PORT"] ?? (motionGames ? "4328" : "4318")) ?? (motionGames ? 4328 : 4318)
    private var origin: String { "http://127.0.0.1:\(port)" }
    private let chrome = URL(fileURLWithPath: "/Applications/Google Chrome.app")
    private var resources: URL { Bundle.main.resourceURL!.appendingPathComponent("Playground") }
    private var support: URL {
        if let path = ProcessInfo.processInfo.environment["SIMPLE_PLAYGROUND_TEST_DATA"] { return URL(fileURLWithPath: path) }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent(motionGames ? "Simple Playground Motion Games" : "Simple Playground")
    }
    private let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 0.8
        config.timeoutIntervalForResource = 1
        return URLSession(configuration: config)
    }()
    private enum Probe { case compatible([String: Any]), occupied(String), unavailable }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        buildWindow()
        for sig in [SIGTERM, SIGINT] {
            signal(sig, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
            source.setEventHandler { [weak self] in
                guard let self = self, !self.signalTerminationRequested else { return }
                self.signalTerminationRequested = true
                // terminateLater runs a nested AppKit loop. Calling terminate
                // inside this main-dispatch callback prevents the child-exit
                // callback and shutdown deadline from using that same queue.
                // Return from dispatch first, then terminate from the run loop.
                NSApp.perform(#selector(NSApplication.terminate(_:)), with: nil, afterDelay: 0)
            }
            source.resume(); signalSources.append(source)
        }
        guard FileManager.default.fileExists(atPath: chrome.path) else {
            fail("Google Chrome is required", "The existing playground was tested in Chrome. Chrome was not found in Applications."); return
        }
        launch()
    }

    private func buildMenu() {
        let bar = NSMenu(), appItem = NSMenuItem(), menu = NSMenu()
        menu.addItem(withTitle: "Show Simple Playground", action: #selector(showWindow), keyEquivalent: "")
        if !motionGames {
        let credentialItem = menu.addItem(withTitle: "Save Spooky Host API Key…", action: #selector(saveHostKey), keyEquivalent: "")
        credentialItem.target = self
        let authorizeItem = menu.addItem(withTitle: "Authorize Saved Spooky Host Key…", action: #selector(authorizeHostKey), keyEquivalent: "")
        authorizeItem.target = self
        }
        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "Quit Simple Playground", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = menu; bar.addItem(appItem); NSApp.mainMenu = bar
    }

    private func buildWindow() {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 430, height: 330), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = motionGames ? "Simple Playground Motion Games" : "Simple Playground"
        window.isReleasedWhenClosed = false
        let title = NSTextField(labelWithString: motionGames ? "✦  Motion Playground" : "☾  Simple Playground")
        title.font = .systemFont(ofSize: 26, weight: .semibold)
        status.font = .systemFont(ofSize: 15, weight: .semibold)
        detail.font = .systemFont(ofSize: 13)
        detail.textColor = .secondaryLabelColor
        controls = NSButton(title: "Open control room", target: self, action: #selector(openControls))
        player = NSButton(title: "Open player", target: self, action: #selector(openPlayer))
        controls.isEnabled = false; player.isEnabled = false
        let buttons = NSStackView(views: [controls, player])
        buttons.orientation = .horizontal; buttons.spacing = 12
        let quit = NSButton(title: "Quit Playground", target: NSApp, action: #selector(NSApplication.terminate(_:)))
        let stack = NSStackView(views: [title, status, detail, buttons, quit])
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 17
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 26),
            stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -26),
            stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 24)
        ])
        window.center(); showWindow()
    }

    @objc func showWindow() { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
    @objc private func saveHostKey() {
        showWindow()
        let alert = NSAlert()
        alert.messageText = "Save Spooky Host API key"
        alert.informativeText = "Stored in your Mac's login Keychain and used automatically on future launches. Quit and reopen the app after saving. Online requests start only when you explicitly start the online host. An environment key, if set, takes priority."
        let field = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 340, height: 24))
        field.placeholderString = "API key"
        alert.accessoryView = field
        alert.window.initialFirstResponder = field
        alert.addButton(withTitle: "Save in Keychain")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { field.stringValue = ""; return }
        let value = field.stringValue
        field.stringValue = ""
        DispatchQueue.global(qos: .userInitiated).async {
            let message: String
            do {
                try HostCredential.save(value)
                message = "The API key is saved in your login Keychain. Quit and reopen Simple Playground to use it. It has not been sent to OpenAI or tested."
            } catch {
                message = (error as? HostCredential.Failure)?.message ?? "The API key could not be saved."
            }
            DispatchQueue.main.async {
                let result = NSAlert()
                result.messageText = "Spooky Host API key"
                result.informativeText = message
                result.runModal()
            }
        }
    }
    @objc private func authorizeHostKey() {
        showWindow()
        DispatchQueue.global(qos: .userInitiated).async {
            let message: String
            do {
                if try HostCredential.load(allowAuthentication: true) != nil {
                    message = "The existing saved API key is readable. Quit and reopen Simple Playground to use it. No API request was made."
                } else {
                    message = "There is no saved Spooky Host key. Use Save Spooky Host API Key once to store it in your login Keychain."
                }
            } catch {
                message = ((error as? HostCredential.Failure)?.message ?? "The saved API key is unavailable.") + " Unlock your login Keychain in Keychain Access and allow this app to read the existing item. Your saved key has not been changed."
            }
            DispatchQueue.main.async {
                let result = NSAlert()
                result.messageText = "Saved Spooky Host key"
                result.informativeText = message
                result.runModal()
            }
        }
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showWindow(); return true }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    private func probe(_ completion: @escaping (Probe) -> Void) {
        var request = URLRequest(url: URL(string: origin + "/api/health")!)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        session.dataTask(with: request) { data, response, error in
            let result: Probe
            if error != nil { result = .unavailable }
            else if let http = response as? HTTPURLResponse, http.statusCode == 200,
                    let data = data, let health = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
                if health["edition"] as? String == "simple-v1", health["version"] as? String == "1.0.1",
                   (health["motionGames"] as? Bool ?? false) == motionGames,
                   health["ok"] as? Bool == true, health["localOnly"] as? Bool == true,
                   health["offlineAssetsReady"] as? Bool == true,
                   health["spookyHost"] as? Bool == !motionGames { result = .compatible(health) }
                else { result = .occupied("Another app, an older Simple Playground, or an incomplete bundle is using port \(self.port). Quit its launcher, then reopen this app. It has been left running.") }
            } else { result = .occupied("Port \(self.port) is responding with an unexpected application. It has been left running.") }
            DispatchQueue.main.async { completion(result) }
        }.resume()
    }

    private func launch() {
        launching = true
        probe { result in
            guard !self.terminating else { return }
            switch result {
            case .compatible(let health): self.becameReady(health, owned: false)
            case .occupied(let reason): self.launching = false; self.fail("Could not start", reason)
            case .unavailable: self.startOwnedServer()
            }
        }
    }

    private func startOwnedServer() {
        if motionGames { startOwnedServer(environment: ["PLAYGROUND_EDITION": "motion"]); return }
        // Security.framework can wait for Keychain services. Keep those calls off
        // the UI thread and continue offline if the key is missing or inaccessible.
        let inherited = ProcessInfo.processInfo.environment
        DispatchQueue.global(qos: .userInitiated).async {
            var environment: [String: String] = [:]
            var notice: String?
            for name in ["SPOOKY_HOST_REQUEST_CAP", "SPOOKY_HOST_TIMEOUT_MS", "OPENAI_VISION_MODEL", "OPENAI_SPEECH_MODEL", "OPENAI_SPEECH_VOICE", "NODE_USE_ENV_PROXY", "NODE_EXTRA_CA_CERTS", "HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"] {
                environment[name] = inherited[name]
            }
            // The native runner probes its own loopback server before readiness.
            // Keep that traffic local even when Node's environment proxy is on.
            for name in ["NO_PROXY", "no_proxy"] {
                let existing = inherited[name]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                environment[name] = (existing.isEmpty ? "" : existing + ",") + "127.0.0.1,localhost,::1"
            }
            let override = [inherited["OPENAI_API_KEY"], inherited["SPOOKY_HOST_API_KEY"]]
                .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.first { !$0.isEmpty }
            do {
                if let value = override { environment["SPOOKY_HOST_API_KEY"] = try HostCredential.validated(value) }
                else { environment["SPOOKY_HOST_API_KEY"] = try HostCredential.load() }
            } catch {
                if override != nil {
                    notice = "The environment API key is invalid. Correct or remove the environment override, then reopen this app. Offline modes remain ready."
                } else {
                    notice = ((error as? HostCredential.Failure)?.message ?? "The API key is unavailable.") + " Use Authorize Saved Spooky Host Key in the app menu, then reopen. Offline modes remain ready."
                }
            }
            let childEnvironment = environment
            let credentialNotice = notice
            DispatchQueue.main.async {
                guard !self.terminating, self.launching else { return }
                self.credentialNotice = credentialNotice
                self.startOwnedServer(environment: childEnvironment)
            }
        }
    }

    private func startOwnedServer(environment: [String: String]) {
        let runtime = resources.appendingPathComponent("runtime/node")
        for file in ["runtime/node", "server.mjs", "scripts/native-runner.mjs", "dist/index.html", "dist/models/pose_landmarker_lite.task"] {
            guard FileManager.default.fileExists(atPath: resources.appendingPathComponent(file).path) else {
                launching = false; fail("The app bundle is incomplete", "Missing \(file). Keep Simple Playground.app intact."); return
            }
        }
        do {
            try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
            let log = support.appendingPathComponent("launcher.log")
            if !FileManager.default.fileExists(atPath: log.path) { FileManager.default.createFile(atPath: log.path, contents: nil) }
            logHandle = try FileHandle(forWritingTo: log)
            try logHandle?.seekToEnd()
            let process = Process(), pipe = Pipe(), outputPipe = Pipe()
            process.executableURL = runtime
            process.arguments = [resources.appendingPathComponent("scripts/native-runner.mjs").path]
            process.currentDirectoryURL = resources
            var serverEnvironment = environment
            serverEnvironment["PATH"] = "/usr/bin:/bin"
            serverEnvironment["PORT"] = String(port)
            serverEnvironment["PLAYGROUND_STATE_FILE"] = support.appendingPathComponent("runtime-state.json").path
            process.environment = serverEnvironment
            process.standardInput = pipe
            process.standardOutput = outputPipe
            process.standardError = logHandle
            outputPipe.fileHandleForReading.readabilityHandler = { handle in
                let data = handle.availableData
                if data.isEmpty { handle.readabilityHandler = nil; return }
                DispatchQueue.main.async {
                    try? self.logHandle?.write(contentsOf: data)
                    guard self.child === process else { return }
                    self.outputBuffer += String(decoding: data, as: UTF8.self)
                    while let newline = self.outputBuffer.firstIndex(of: "\n") {
                        let line = String(self.outputBuffer[..<newline])
                        self.outputBuffer.removeSubrange(...newline)
                        if let value = (try? JSONSerialization.jsonObject(with: Data(line.utf8))) as? [String: Any],
                           value["type"] as? String == "ready", value["pid"] as? Int == Int(process.processIdentifier) { self.childReady = true }
                    }
                }
            }
            process.terminationHandler = { _ in DispatchQueue.main.async { self.serverExited() } }
            child = process; input = pipe; output = outputPipe; outputBuffer = ""; childReady = false
            try process.run()
            waitUntilReady(deadline: Date().addingTimeInterval(15))
        } catch {
            launching = false; child = nil; input = nil
            fail("Could not start local runtime", error.localizedDescription)
        }
    }

    private func waitUntilReady(deadline: Date) {
        guard !terminating, launching else { return }
        if Date() >= deadline {
            launching = false; stopOwned()
            fail("Startup timed out", "The bundled server did not become ready. Details are in \(support.appendingPathComponent("launcher.log").path).")
            return
        }
        probe { result in
            guard !self.terminating, self.launching else { return }
            switch result {
            case .compatible(let health):
                if self.child == nil || self.childReady { self.becameReady(health, owned: self.childReady) }
                else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { self.waitUntilReady(deadline: deadline) } }
            case .occupied(let reason): self.launching = false; self.stopOwned(); self.fail("Could not start", reason)
            case .unavailable:
                if Date() >= deadline {
                    self.launching = false; self.stopOwned()
                    self.fail("Startup timed out", "The bundled server did not become ready. Details are in \(self.support.appendingPathComponent("launcher.log").path).")
                } else {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { self.waitUntilReady(deadline: deadline) }
                }
            }
        }
    }

    private func becameReady(_ health: [String: Any], owned: Bool) {
        launching = false; ready = true
        status.stringValue = "Ready — running on this Mac"
        detail.stringValue = owned ? "Both windows open in Chrome. Start the camera there when ready. Quit this app to stop the local server." : "Using your already-running Simple Playground. Quit that original launcher to stop its server."
        if owned, let notice = credentialNotice { detail.stringValue = notice }
        controls.isEnabled = true; player.isEnabled = true
        openChrome(origin + "/")
        if health["playerConnected"] as? Bool != true { openChrome(origin + "/?view=player") }
    }

    private func openChrome(_ url: String) {
        if ProcessInfo.processInfo.environment["SIMPLE_PLAYGROUND_TEST_NO_BROWSER"] == "1" { return }
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.createsNewApplicationInstance = true
        configuration.arguments = ["--app=" + url]
        NSWorkspace.shared.openApplication(at: chrome, configuration: configuration) { _, error in
            if let error = error { DispatchQueue.main.async { self.fail("Chrome could not open", "\(error.localizedDescription) You can open \(url) directly in Chrome.") } }
        }
    }
    @objc func openControls() { if ready { openChrome(origin + "/") } }
    @objc func openPlayer() {
        guard ready else { return }
        probe { result in
            if case .compatible(let health) = result {
                if health["playerConnected"] as? Bool == true {
                    NSWorkspace.shared.openApplication(at: self.chrome, configuration: NSWorkspace.OpenConfiguration(), completionHandler: nil)
                    self.detail.stringValue = "A player is already open in Chrome. Use its Fullscreen button when it is on the TV."
                } else { self.openChrome(self.origin + "/?view=player") }
            } else { self.fail("Server is unavailable", "Quit and reopen Simple Playground to restart it.") }
        }
    }

    private func serverExited() {
        child = nil; childReady = false; try? input?.fileHandleForWriting.close(); input = nil
        output?.fileHandleForReading.readabilityHandler = nil; output = nil
        if terminating { NSApp.reply(toApplicationShouldTerminate: true); return }
        if launching {
            probe { result in
                guard !self.terminating, self.launching else { return }
                if case .compatible(let health) = result { self.becameReady(health, owned: false) }
                else {
                    self.launching = false
                    self.fail("Local server could not start", "Another app may be using port \(self.port). Details: \(self.support.appendingPathComponent("launcher.log").path)")
                }
            }
        } else if ready {
            ready = false; controls.isEnabled = false; player.isEnabled = false
            fail("Local server stopped", "Quit and reopen Simple Playground to restart it. The camera stops when the player disconnects.")
        }
    }

    private func fail(_ title: String, _ message: String) {
        status.stringValue = title; detail.stringValue = message
        showWindow()
    }
    private func stopOwned() {
        try? input?.fileHandleForWriting.close(); input = nil
        if let process = child, process.isRunning { process.terminate() }
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let process = child, process.isRunning else { return .terminateNow }
        if terminating { return .terminateLater }
        terminating = true; status.stringValue = "Stopping local server…"
        stopOwned()
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) {
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
            NSApp.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }
}

if motionGames && CommandLine.arguments.dropFirst().contains(where: { $0.contains("spooky-host-key") }) { exit(EXIT_FAILURE) }
if !motionGames, let result = HostCredential.runCommand(Array(CommandLine.arguments.dropFirst())) { exit(result) }

let application = NSApplication.shared
application.setActivationPolicy(.regular)
let delegate = PlaygroundDelegate()
application.delegate = delegate
application.run()
