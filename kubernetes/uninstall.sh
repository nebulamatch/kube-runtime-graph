#!/bin/bash
echo "Uninstalling Kubernetes Runtime Graph Agent..."
kubectl delete daemonset kube-runtime-agent -n kube-system
echo "Uninstall complete."
