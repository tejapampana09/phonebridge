import sys
import json
import threading
import time
import sounddevice as sd
import numpy as np

# Global state
loopback_active = False
stop_event = threading.Event()
mute_lock = threading.Lock()
is_muted = [False]

thread_phone_to_pc = None
thread_pc_to_phone = None

def get_common_samplerate(in_dev, out_dev):
    # Try 16000 Hz (standard HFP/mSBC)
    try:
        sd.check_input_settings(device=in_dev, samplerate=16000, channels=1)
        sd.check_output_settings(device=out_dev, samplerate=16000, channels=1)
        return 16000
    except Exception:
        pass

    # Try 8000 Hz (standard HFP/CVSD)
    try:
        sd.check_input_settings(device=in_dev, samplerate=8000, channels=1)
        sd.check_output_settings(device=out_dev, samplerate=8000, channels=1)
        return 8000
    except Exception:
        pass

    # Try 48000 Hz
    try:
        sd.check_input_settings(device=in_dev, samplerate=48000, channels=1)
        sd.check_output_settings(device=out_dev, samplerate=48000, channels=1)
        return 48000
    except Exception:
        pass

    # Fallback to output device default
    try:
        dev_info = sd.query_devices(out_dev)
        return int(dev_info['default_samplerate'])
    except Exception:
        return 16000

def loop_phone_to_pc(phone_in, pc_out, samplerate, stop_evt):
    try:
        with sd.InputStream(device=phone_in, channels=1, samplerate=samplerate, dtype='float32', blocksize=512) as in_s:
            with sd.OutputStream(device=pc_out, channels=1, samplerate=samplerate, dtype='float32', blocksize=512) as out_s:
                while not stop_evt.is_set():
                    data, overflowed = in_s.read(512)
                    out_s.write(data)
    except Exception as e:
        sys.stderr.write(f"[Helper] Error in Phone -> PC loop: {e}\n")
        sys.stderr.flush()

def loop_pc_to_phone(pc_in, phone_out, samplerate, stop_evt, m_lock, m_state):
    try:
        with sd.InputStream(device=pc_in, channels=1, samplerate=samplerate, dtype='float32', blocksize=512) as in_s:
            with sd.OutputStream(device=phone_out, channels=1, samplerate=samplerate, dtype='float32', blocksize=512) as out_s:
                while not stop_evt.is_set():
                    data, overflowed = in_s.read(512)
                    with m_lock:
                        if m_state[0]:
                            data = np.zeros_like(data)
                    out_s.write(data)
    except Exception as e:
        sys.stderr.write(f"[Helper] Error in PC -> Phone loop: {e}\n")
        sys.stderr.flush()

def list_devices():
    try:
        devices = sd.query_devices()
        dev_list = []
        for i, d in enumerate(devices):
            dev_list.append({
                "index": i,
                "name": d["name"],
                "max_input_channels": d["max_input_channels"],
                "max_output_channels": d["max_output_channels"],
                "default_samplerate": d["default_samplerate"]
            })
        return {"status": "success", "devices": dev_list}
    except Exception as e:
        return {"status": "error", "error": f"Failed to list devices: {str(e)}"}

def start_loopback(phone_input_id, phone_output_id, pc_input_id, pc_output_id):
    global loopback_active, stop_event, thread_phone_to_pc, thread_pc_to_phone

    if loopback_active:
        return {"status": "success", "message": "Loopback already active"}

    try:
        # Resolve names to indices if passed as strings
        devices = sd.query_devices()
        
        def resolve_device(dev_id, is_input):
            if isinstance(dev_id, int):
                return dev_id
            # Search by substring
            query = str(dev_id).lower()
            for idx, d in enumerate(devices):
                name = d["name"].lower()
                if query in name:
                    if is_input and d["max_input_channels"] > 0:
                        return idx
                    elif not is_input and d["max_output_channels"] > 0:
                        return idx
            # If nothing matched, look for HFP defaults or return system default
            for idx, d in enumerate(devices):
                name = d["name"].lower()
                if "hands-free" in name or "hfp" in name or "bthhfenum" in name:
                    if is_input and d["max_input_channels"] > 0:
                        return idx
                    elif not is_input and d["max_output_channels"] > 0:
                        return idx
            return sd.default.device[0] if is_input else sd.default.device[1]

        phone_in = resolve_device(phone_input_id, True)
        phone_out = resolve_device(phone_output_id, False)
        pc_in = resolve_device(pc_input_id, True)
        pc_out = resolve_device(pc_output_id, False)

        sys.stderr.write(f"[Helper] Starting loopback with devices: PhoneIn={phone_in}, PhoneOut={phone_out}, PCIn={pc_in}, PCOut={pc_out}\n")
        sys.stderr.flush()

        # Determine sample rates
        rate_1 = get_common_samplerate(phone_in, pc_out)
        rate_2 = get_common_samplerate(pc_in, phone_out)

        stop_event.clear()
        
        thread_phone_to_pc = threading.Thread(
            target=loop_phone_to_pc, 
            args=(phone_in, pc_out, rate_1, stop_event),
            daemon=True
        )
        thread_pc_to_phone = threading.Thread(
            target=loop_pc_to_phone, 
            args=(pc_in, phone_out, rate_2, stop_event, mute_lock, is_muted),
            daemon=True
        )

        thread_phone_to_pc.start()
        thread_pc_to_phone.start()

        loopback_active = True
        return {
            "status": "success", 
            "message": "Loopback started",
            "rates": {"phone_to_pc": rate_1, "pc_to_phone": rate_2}
        }
    except Exception as e:
        return {"status": "error", "error": f"Failed to start loopback: {str(e)}"}

def stop_loopback():
    global loopback_active, stop_event, thread_phone_to_pc, thread_pc_to_phone

    if not loopback_active:
        return {"status": "success", "message": "Loopback not active"}

    try:
        stop_event.set()
        if thread_phone_to_pc:
            thread_phone_to_pc.join(timeout=1.0)
        if thread_pc_to_phone:
            thread_pc_to_phone.join(timeout=1.0)
        
        thread_phone_to_pc = None
        thread_pc_to_phone = None
        loopback_active = False
        return {"status": "success", "message": "Loopback stopped"}
    except Exception as e:
        return {"status": "error", "error": f"Failed to stop loopback: {str(e)}"}

def set_mute(muted):
    with mute_lock:
        is_muted[0] = bool(muted)
    return {"status": "success", "muted": is_muted[0]}

def main():
    sys.stderr.write("[Helper] Python audio helper initialized.\n")
    sys.stderr.flush()

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                # EOF reached, parent process exited
                break
            
            line = line.strip()
            if not line:
                continue

            try:
                request = json.loads(line)
            except ValueError:
                print(json.dumps({"status": "error", "error": "Invalid JSON"}))
                sys.stdout.flush()
                continue

            cmd = request.get("command")
            
            if cmd == "LIST_DEVICES":
                response = list_devices()
            elif cmd == "START_LOOPBACK":
                args = request.get("args", {})
                response = start_loopback(
                    args.get("phone_input"),
                    args.get("phone_output"),
                    args.get("pc_input"),
                    args.get("pc_output")
                )
            elif cmd == "STOP_LOOPBACK":
                response = stop_loopback()
            elif cmd == "SET_MUTE":
                args = request.get("args", {})
                response = set_mute(args.get("muted", False))
            elif cmd == "PING":
                response = {"status": "success", "message": "PONG"}
            else:
                response = {"status": "error", "error": f"Unknown command: {cmd}"}

            print(json.dumps(response))
            sys.stdout.flush()

        except Exception as e:
            sys.stderr.write(f"[Helper] Main loop error: {e}\n")
            sys.stderr.flush()
            break

    # Clean up loopback on exit
    stop_loopback()
    sys.stderr.write("[Helper] Python audio helper terminated.\n")
    sys.stderr.flush()

if __name__ == "__main__":
    main()
