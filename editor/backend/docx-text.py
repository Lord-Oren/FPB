# Bounded OOXML extraction only. No Office engine, macros, external resources or XML entity expansion.
import sys,zipfile,json,xml.etree.ElementTree as ET
with zipfile.ZipFile(sys.argv[1]) as z:
    entries=z.infolist()
    assert len(entries)<=2000 and len({e.filename for e in entries})==len(entries)
    assert sum(e.file_size for e in entries)<=30*1024*1024
    for e in entries:
        assert not e.flag_bits&1 and e.compress_type in (0,8)
        assert e.file_size<=10*1024*1024 and e.file_size<=max(1024,e.compress_size*200)
        assert not e.filename.startswith('/') and '..' not in e.filename.split('/')
        assert not any(x in e.filename.lower() for x in ('vbaproject','embeddings/','activex/'))
    types=z.read('[Content_Types].xml')
    assert b'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' in types
    raw=z.read('word/document.xml')
    assert b'<!DOCTYPE' not in raw.upper() and b'<!ENTITY' not in raw.upper()
    root=ET.fromstring(raw)
    ns='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    text='\n'.join(''.join(t.text or '' for t in p.iter(ns+'t')) for p in root.iter(ns+'p'))
    assert 0<len(text.strip())<=50000
    print(json.dumps(text,ensure_ascii=True))
