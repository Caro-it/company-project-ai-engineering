"""LockedJSONStorage: lecturas y escrituras concurrentes sobre el mismo archivo."""
from concurrent.futures import ThreadPoolExecutor

from app.database import LockedJSONStorage

DATA = {"incidents": {str(i): {"id": str(i), "title": "x" * 200} for i in range(200)}}


def test_concurrent_reads_and_writes_do_not_corrupt(tmp_path):
    # Archivo temporal de pytest: no toca services/api/data/
    storage = LockedJSONStorage(tmp_path / "db.json", create_dirs=True, encoding="utf-8")
    storage.write(DATA)

    def read(_):
        return storage.read()

    def write(_):
        storage.write(DATA)

    # Con JSONStorage sin lock, este patrón da JSONDecodeError en parte de las lecturas
    with ThreadPoolExecutor(max_workers=8) as pool:
        reads = list(pool.map(read, range(400)))
        list(pool.map(write, range(50)))
        reads += list(pool.map(read, range(400)))

    assert all(result == DATA for result in reads)
    storage.close()
