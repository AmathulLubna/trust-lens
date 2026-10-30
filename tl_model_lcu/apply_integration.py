"""Check/apply the small integration patch. Existing source files are reused."""
import argparse
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Apply after checking all patch contexts")
    parser.add_argument("--reverse", action="store_true", help="Check/reverse only this integration patch")
    args = parser.parse_args()
    command = ["git", "apply", "--ignore-space-change"]
    if args.reverse:
        command.append("--reverse")
    patch = str(HERE / "integration.patch")
    checked = subprocess.run([*command, "--check", patch], cwd=HERE.parent, capture_output=True, text=True)
    if checked.returncode:
        opposite = ["git", "apply", "--ignore-space-change"]
        if not args.reverse:
            opposite.append("--reverse")
        already = subprocess.run([*opposite, "--check", patch], cwd=HERE.parent, capture_output=True, text=True)
        if not already.returncode:
            print("Integration is already " + ("removed." if args.reverse else "applied. No additional changes are needed."))
            return 0
        if checked.stderr:
            print(checked.stderr.strip())
        print("Patch does not match the current files. Review integration.patch; no files were changed.")
        return checked.returncode
    if args.apply:
        return subprocess.run([*command, patch], cwd=HERE.parent).returncode
    print("Integration patch is ready. Add --apply to update the referenced app files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
