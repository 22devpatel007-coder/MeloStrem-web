export const PageWrapper = ({ title, children }) => (
  <main className='flex-1 p-6 overflow-y-auto'>
    {title && <h1 className='text-2xl font-bold mb-6'>{title}</h1>}
    {children}
  </main>
);
