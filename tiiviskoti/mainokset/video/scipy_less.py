import wave, numpy as np
def write_wav(path, data, sr):
    d=np.clip(data,-1,1); a=(d*32767).astype('<i2')
    w=wave.open(path,'wb'); w.setnchannels(a.shape[1]); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes(a.tobytes()); w.close()
