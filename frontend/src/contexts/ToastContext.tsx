import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { toast, ToastContainer, type ToastOptions } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface ToastContextType {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
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
  const success = useCallback((message: string) => {
    toast.success(message, { ...defaultOptions, className: 'toast-success' });
  }, []);

  const error = useCallback((message: string) => {
    toast.error(message, { ...defaultOptions, className: 'toast-error' });
  }, []);

  const info = useCallback((message: string) => {
    toast.info(message, { ...defaultOptions, className: 'toast-info' });
  }, []);

  const warning = useCallback((message: string) => {
    toast.warning(message, { ...defaultOptions, className: 'toast-warning' });
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
