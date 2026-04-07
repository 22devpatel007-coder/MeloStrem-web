import { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export const UploadForm = ({ onSubmit, isLoading, multiple = false }) => {
  const [fields, setFields] = useState({ title: '', artist: '', album: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    Object.entries(fields).forEach(([k, v]) => formData.set(k, v));
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className='flex flex-col gap-4'>
      {!multiple && (
        <>
          <Input label='Title' value={fields.title} onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))} required />
          <Input label='Artist' value={fields.artist} onChange={(e) => setFields((f) => ({ ...f, artist: e.target.value }))} required />
          <Input label='Album' value={fields.album} onChange={(e) => setFields((f) => ({ ...f, album: e.target.value }))} />
        </>
      )}
      <input type='file' name='audio' accept='audio/*' multiple={multiple} required className='text-sm' />
      <Button type='submit' isLoading={isLoading}>{multiple ? 'Upload All' : 'Upload'}</Button>
    </form>
  );
};
