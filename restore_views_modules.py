from pathlib import Path
import subprocess
p=Path('/home/ubuntu/bolsocal/src/features/Views.tsx')
current=p.read_text()
original=subprocess.check_output(['git','show','HEAD:src/features/Views.tsx'],text=True)
def segment(a,b):
    start=original.index(f'function {a}(')
    end=original.index(f'function {b}(',start)
    return original[start:end]
restore='\n'.join([
    segment('Calendar','Categories'),
    segment('Categories','Rules'),
    segment('Rules','Trash'),
    segment('Settings','Receipts'),
])
marker='function Receipts('
assert current.count(marker)==1
current=current.replace(marker,restore+'\n'+marker,1)
p.write_text(current)
print('Restored Calendar, Categories, Rules and Settings components from HEAD.')
