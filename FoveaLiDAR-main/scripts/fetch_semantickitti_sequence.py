"""
scripts/fetch_semantickitti_sequence.py

Downloads ONLY the requested sequence(s)' velodyne scans from the
official 80GB bundle, using HTTP range requests (via the `remotezip`
package) to read individual files out of the remote zip's central
directory - the full 80GB is never fetched, only the bytes belonging to
the sequences you ask for.

Why this exists: the official distribution bundles all 22 sequences into
one archive with no per-sequence download option. This project's own
Stage A only ever needed one or two sequences (PHASES.md, Document 2) -
there's no reason to pull the other ~75GB to get there.

Honesty check before you rely on this: this technique needs the server
to support HTTP range requests, which almost all static file servers do,
but there is no network path to cvlibs.net from the environment this
script was written in, so it has not been run against the real archive.
If it fails immediately with something about range support, see
EXECUTION_GUIDE.md's fallback options instead of assuming the script is
broken.

Usage:
    pip install remotezip
    python scripts/fetch_semantickitti_sequence.py 00 --dest ./semantic_kitti_subset
    python scripts/fetch_semantickitti_sequence.py 00 08 --dest ./semantic_kitti_subset
"""
import argparse
import sys
import urllib.request
import zipfile
from pathlib import Path

try:
    from remotezip import RemoteZip
except ImportError:
    sys.exit("Missing dependency - run: pip install remotezip")

# Verified against semantic-kitti.org/dataset.html directly - see EXECUTION_GUIDE.md Step 1.
VELODYNE_URL = "http://www.cvlibs.net/download.php?file=data_odometry_velodyne.zip"
LABELS_URL = "https://semantic-kitti.org/assets/data_odometry_labels.zip"


def _matches_sequence(name: str, seq: str) -> bool:
    # Substring match rather than an assumed fixed prefix, deliberately -
    # the exact internal path prefix inside the official zip (e.g. whether
    # it's "dataset/sequences/00/..." or "sequences/00/...") couldn't be
    # confirmed without downloading it, so this matches either.
    return f"sequences/{seq}/velodyne/" in name


def fetch_velodyne(sequences, dest: Path) -> None:
    print(f"Reading {VELODYNE_URL}'s central directory only (this step does NOT "
          f"download the 80GB archive - just its file listing)...")
    with RemoteZip(VELODYNE_URL) as zf:
        names = zf.namelist()
        print(f"Archive lists {len(names)} files. First few, for sanity-checking the path structure:")
        for n in names[:5]:
            print("   ", n)

        members = [n for n in names if any(_matches_sequence(n, seq) for seq in sequences)]
        if not members:
            sys.exit(
                f"No files matched sequences {sequences}. The path structure printed above "
                f"doesn't contain 'sequences/<seq>/velodyne/' as a substring - inspect it and "
                f"adjust _matches_sequence() before retrying, rather than assuming the download itself failed."
            )

        total_gb = sum(info.file_size for info in zf.infolist() if info.filename in members) / (1024 ** 3)
        print(f"{len(members)} files matched across {sequences} - {total_gb:.2f} GB total. Downloading only these.")

        for i, name in enumerate(members):
            zf.extract(name, path=dest)
            if (i + 1) % 500 == 0:
                print(f"  {i + 1}/{len(members)}")

    print(f"Velodyne scans for {sequences} done.\n")


def fetch_labels(sequences, dest: Path) -> None:
    # Labels are ~179MB for ALL sequences combined already - small enough
    # that partial-fetching isn't worth the complexity of a second
    # range-request pass; download the whole thing and keep every
    # sequence's labels, not just the ones requested.
    labels_zip = dest / "_labels_tmp.zip"
    print(f"Downloading {LABELS_URL} (~179MB, all sequences - small enough to just get all of it)...")
    urllib.request.urlretrieve(LABELS_URL, labels_zip)
    with zipfile.ZipFile(labels_zip) as zf:
        zf.extractall(dest)
    labels_zip.unlink()
    print("Labels done.\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("sequences", nargs="+", help="Sequence numbers, e.g. 00 08")
    parser.add_argument("--dest", default="./semantic_kitti_subset")
    args = parser.parse_args()

    sequence_ids = [s.zfill(2) for s in args.sequences]
    dest_dir = Path(args.dest)
    dest_dir.mkdir(parents=True, exist_ok=True)

    fetch_velodyne(sequence_ids, dest_dir)
    fetch_labels(sequence_ids, dest_dir)

    print(f"Done. Point DATASET_ROOT at {dest_dir.resolve()} in notebooks/local/01_dataset_exploration.ipynb.")
