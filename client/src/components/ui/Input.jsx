import React from 'react';

export const Input = React.forwardRef(({ 
  label, 
  error, 
  className = '', 
  id, 
  ...props 
}, ref) => {
  const inputId = id || Math.random().toString(36).substr(2, 9);
  
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-300">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`bg-[#313131] border text-white rounded-md px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#22c55e] transition-colors ${
          error ? 'border-red-500 focus:ring-red-500' : 'border-transparent'
        }`}
        {...props}
      />
      {error && <span className="text-sm text-red-500">{error}</span>}
    </div>
  );
});

Input.displayName = 'Input';
export default Input;
