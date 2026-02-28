import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { toast, ToastContainer, type ToastOptions } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface ToastOptionsWithClick extends ToastOptions {
  onClick?: () => void;
}

interface ToastContextType {
  success: (message: string, options?: ToastOptionsWithClick) => void;
  error: (message: string, options?: ToastOptionsWithClick) => void;
  info: (message: string, options?: ToastOptionsWithClick) => void;
  warning: (message: string, options?: ToastOptionsWithClick) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const defaultOptions: ToastOptions = {
  position: 'top-right',
  autoClose: 5000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const success = useCallback((message: string, options?: ToastOptionsWithClick) => {
    toast.success(message, { ...defaultOptions, className: 'toast-success', ...options });
  }, []);

  const error = useCallback((message: string, options?: ToastOptionsWithClick) => {
    toast.error(message, { ...defaultOptions, className: 'toast-error', ...options });
  }, []);

  const info = useCallback((message: string, options?: ToastOptionsWithClick) => {
    toast.info(message, { ...defaultOptions, className: 'toast-info', ...options });
  }, []);

  const warning = useCallback((message: string, options?: ToastOptionsWithClick) => {
    toast.warning(message, { ...defaultOptions, className: 'toast-warning', ...options });
  }, []);

  return (
    <ToastContext.Provider value={{ success, error, info, warning }}>
      {children}
      <ToastContainer
        theme="dark"
        limit={5}
        newestOnTop
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
