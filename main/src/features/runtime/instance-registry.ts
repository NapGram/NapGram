export interface RegisteredInstance {
  id: number
}

const instances: RegisteredInstance[] = []

export const instanceRegistry = {
  add(instance: RegisteredInstance) {
    if (!instances.find(item => item.id === instance.id)) {
      instances.push(instance)
    }
  },
  remove(id: number) {
    const index = instances.findIndex(item => item.id === id)
    if (index !== -1) {
      instances.splice(index, 1)
    }
  },
  getAll() {
    return instances
  },
  getById(id: number) {
    return instances.find(item => item.id === id)
  },
}
