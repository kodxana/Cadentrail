"""Report actual YuE2 counts without changing its generation or random state."""
import contextlib,time,types

def install_pipeline_progress(pipe,emit):
    @contextlib.contextmanager
    def status(self,label,*,total=None,unit=None):
        state='Rendering' if label in ('Synthesizing audio','Decoding audio','Loading audio decoder') else 'Generating' if label=='Generating song' else 'Planning' if label in ('Planning score','Using provided score') else 'Preparing'
        class Stage:
            done=0
            last=0
            limit=total
            def publish(self,force=False):
                now=time.monotonic()
                if force or now-self.last>=.4:
                    emit(state=state,message=label,progress=self.done/self.limit if self.limit else None,progressLabel=label,unitsDone=self.done,unitsTotal=self.limit,unit=unit)
                    self.last=now
            def advance(self,n=1):self.update(self.done+n)
            def update(self,completed,*,total=None):
                self.done=completed
                if total is not None:self.limit=total
                self.publish()
            def finish(self,**kwargs):self.publish(True)
        stage=Stage();stage.publish(True)
        try:yield stage
        finally:stage.publish(True)
    pipe._status=types.MethodType(status,pipe)
