import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getProducts, createProduct, updateProduct, deleteProduct, adjustStock, resetStock, getStockMovements,
  getServices, createService, updateService, deleteService,
  getResources, createResource, updateResource, deleteResource,
  getBusinessHours, saveBusinessHours, saveTimezone,
  getServiceResourceMap, setServiceResources, setResourceServices,
  getResourceHours, saveResourceHours,
} from "@/actions/catalogue";

function crud(key, fn) {
  return function useIt() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: fn,
      onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
    });
  };
}

function crudWithId(key, fn) {
  return function useIt() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: ({ id, updates }) => fn(id, updates),
      onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
    });
  };
}

/* products */
export function useProducts(filters) {
  return useQuery({ queryKey: ["products", filters], queryFn: () => getProducts(filters) });
}
export const useCreateProduct = crud("products", createProduct);
export const useUpdateProduct = crudWithId("products", updateProduct);
export const useDeleteProduct = crud("products", deleteProduct);
export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adjustStock,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
    },
  });
}

export function useResetStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productId = null) => resetStock(productId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
    },
  });
}
export function useStockMovements(productId) {
  return useQuery({
    queryKey: ["stock-movements", productId],
    queryFn: () => getStockMovements(productId),
    enabled: Boolean(productId),
  });
}

/* services */
export function useServices(filters) {
  return useQuery({ queryKey: ["services", filters], queryFn: () => getServices(filters), staleTime: 60_000 });
}
export const useCreateService = crud("services", createService);
export const useUpdateService = crudWithId("services", updateService);
export const useDeleteService = crud("services", deleteService);

/* resources */
export function useResources() {
  return useQuery({ queryKey: ["resources"], queryFn: getResources, staleTime: 5 * 60_000 });
}
export const useCreateResource = crud("resources", createResource);
export const useUpdateResource = crudWithId("resources", updateResource);
export const useDeleteResource = crud("resources", deleteResource);

/* service ↔ resource */
export function useServiceResourceMap() {
  return useQuery({ queryKey: ["service-resource"], queryFn: getServiceResourceMap, staleTime: 5 * 60_000 });
}
export function useSetServiceResources() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, resourceIds }) => setServiceResources(serviceId, resourceIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-resource"] });
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}

export function useSetResourceServices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ resourceId, serviceIds }) => setResourceServices(resourceId, serviceIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-resource"] });
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}

/* resource hours */
export function useResourceHours(resourceId) {
  return useQuery({
    queryKey: ["resource-hours", resourceId],
    queryFn: () => getResourceHours(resourceId),
    enabled: Boolean(resourceId),
  });
}
export function useSaveResourceHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ resourceId, rows }) => saveResourceHours(resourceId, rows),
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: ["resource-hours", v.resourceId] }),
  });
}

/* hours */
export function useBusinessHours() {
  return useQuery({ queryKey: ["business-hours"], queryFn: getBusinessHours, staleTime: 5 * 60_000 });
}
export const useSaveBusinessHours = crud("business-hours", saveBusinessHours);

export function useSaveTimezone() {
  return useMutation({ mutationFn: (timezone) => saveTimezone(timezone) });
}
